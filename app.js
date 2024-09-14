const express = require('express');
const path = require('path');
const reportRouter = require('./routes/report');
const session = require('express-session');

const app = express();

// 设置模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 静态文件
// 设置 public 目录为静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 静态文件
// 解析 application/x-www-form-urlencoded 表单数据
app.use(express.urlencoded({ extended: true }));
// 解析 application/json 格式数据
app.use(express.json());

app.use(session({
    secret: 'your-secret-key',  // 随便一个密钥
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }   // 开发环境下可以设置 secure: false
}));

// 路由
app.use('/report', reportRouter);

// 服务器端口
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
