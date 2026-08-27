const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// إعداد الجلسات (Sessions) وحماية لوحة التحكم
app.use(session({
  secret: 'tikka-super-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // اجعلها true إذا كنت تستخدم HTTPS فعلياً
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// كلمة المرور الخاصة بلوحة التحكم (يمكنك تغييرها هنا)
const ADMIN_PASSWORD = 'admin123';

// قاعدة بيانات مؤقتة في الذاكرة (Memory Database)
let db = {
  products: [
    { id: '1', name: 'وجبة تكة السريعة', description: 'وجبة ممتازة ولذيذة مع المشروب', price: 29, category: 'وجبات', image: '', active: true },
    { id: '2', name: 'مشروب طاقة تكة', description: 'انتعاش وفورية في كل رشفة', price: 9, category: 'مشروبات', image: '', active: true }
  ],
  orders: [],
  discounts: [
    { id: 'd1', code: 'TIKKA50', type: 'percent', value: 50, active: true }
  ],
  settings: {
    banners: [{ id: 'b1', text: 'أهلاً بك في منصة تكة الفورية! 🚀', active: true }]
  }
};

// --- مسارات المصادقة (Authentication) ---
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// وسيط حماية مسارات الأدمن
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  res.status(401).redirect('/admin-login');
}

// حماية صفحة الأدمن HTML نفسها
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- API العامة (للعملاء) ---
app.get('/api/products', (req, res) => {
  res.json(db.products.filter(p => p.active !== false));
});

app.get('/api/settings', (req, res) => {
  res.json(db.settings);
});

app.post('/api/orders', (req, res) => {
  const newOrder = {
    id: Date.now().toString(),
    shortId: Math.floor(1000 + Math.random() * 9000),
    customer: req.body.customer || { name: 'عميل', phone: '0500000000', address: 'المدينة المنورة' },
    items: req.body.items || [],
    total: req.body.total || 0,
    paymentMethod: req.body.paymentMethod || 'cash',
    status: 'new',
    createdAt: new Date()
  };
  db.orders.unshift(newOrder);
  
  // إرسال تنبيه فوري للوحة التحكم عبر Socket.io
  io.to('admin-room').emit('new-order', newOrder);
  res.json({ success: true, orderId: newOrder.id });
});

// --- API لوحة التحكم (محمية) ---
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json(db.orders);
});

app.put('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const order = db.orders.find(o => o.id === id);
  if (order) {
    order.status = status;
    io.to('admin-room').emit('order-updated', order);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'الطلب غير موجود' });
});

app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json(db.products);
});

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const p = { id: Date.now().toString(), ...req.body };
  db.products.push(p);
  res.json({ success: true, product: p });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = db.products.findIndex(p => p.id === id);
  if (index !== -1) {
    db.products[index] = { id, ...req.body };
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'المنتج غير موجود' });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  db.products = db.products.filter(p => p.id !== id);
  res.json({ success: true });
});

app.get('/api/admin/discounts', requireAdmin, (req, res) => {
  res.json(db.discounts);
});

app.post('/api/admin/discounts', requireAdmin, (req, res) => {
  const d = { id: Date.now().toString(), ...req.body };
  db.discounts.push(d);
  res.json({ success: true });
});

app.delete('/api/admin/discounts/:id', requireAdmin, (req, res) => {
  db.discounts = db.discounts.filter(d => d.id !== id);
  res.json({ success: true });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  db.settings = { ...db.settings, ...req.body };
  res.json({ success: true });
});

// Socket.io للأدمن
io.on('connection', (socket) => {
  socket.on('join-admin', () => {
    socket.join('admin-room');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 منصة تكة تعمل بكفاءة على المنفذ: ${PORT}`);
});
