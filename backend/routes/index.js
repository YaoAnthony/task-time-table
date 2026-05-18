const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const ROUTE_ALLOWLIST = new Set([
  'auth.js',
  'coupon.js',
  'profile.js',
  'storyline.js',
  'system.js',
]);

// 自动加载路由文件（白名单，避免误加载）
const routeFiles = fs.readdirSync(__dirname).filter((file) => {
  return ROUTE_ALLOWLIST.has(file);
});

routeFiles.forEach((file) => {
  const route = require(path.join(__dirname, file));
  const routeName = `/${file.replace('.js', '')}`; // 用文件名生成路由前缀
  console.log(`Loading route: ${routeName}`);
  router.use(routeName, route);
});

/* GET home page. */
router.get('/', function (req, res) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
