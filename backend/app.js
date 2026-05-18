const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors'); // 跨域支持
const indexRouter = require('./routes/index'); // 动态加载路由文件

const { connectLocalDatabase, getDatabasePath } = require('./db/localDatabase');

// .env 配置
require('dotenv').config();

const app = express();

const allowedOrigins = [
  process.env.Website_URL,          
  "http://localhost:4000",           // 建议开发时写死一条，避免 env 缺失
  "http://127.0.0.1:4000",
];


// 跨域配置
const corsOptions = {
  origin(origin, cb) {
    // 允许无 origin 的请求（Postman / server-to-server / curl）
    if (!origin) return cb(null, true);

    // 允许 VS Code Webview
    // 形如：vscode-webview://<uuid>
    if (origin.startsWith("vscode-webview://")) return cb(null, true);

    // 允许你的网站 / 本地前端
    if (allowedOrigins.includes(origin)) return cb(null, true);

    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true, // 允许 cookie / auth header
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// 关键：处理预检请求，否则会卡在 preflight
app.options("*", cors(corsOptions));

//connect to the database
console.log("---------------------------------");
console.log("Connecting to the local SQLite database...");
connectLocalDatabase();
console.log(`SQLite database ready: ${getDatabasePath()}`);
console.log("---------------------------------");


// 设置视图引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: false, limit: '25mb' }));

// 中间件配置
app.use(logger('dev')); // 日志输出
app.use(express.json()); // JSON 请求体解析
app.use(express.urlencoded({ extended: false })); // URL 编码解析
app.use(cookieParser()); // 处理 Cookies
app.use(express.static(path.join(__dirname, 'public'))); // 静态文件服务

// 挂载路由
app.use('/', indexRouter);

// 捕获 404 错误并转发到错误处理器
app.use(function (req, res, next) {
  next(createError(404));
});

// 错误处理器
app.use(function (err, req, res, next) {
  // 设置本地变量，仅在开发环境提供错误信息
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // 渲染错误页面
  res.status(err.status || 500);
  if (req.originalUrl?.startsWith('/profile') || req.accepts('json')) {
    return res.json({ message: err.message || 'Server error' });
  }
  res.render('error');
});

module.exports = app;
