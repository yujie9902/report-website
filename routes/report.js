const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const ExcelJS = require('exceljs');
const fs = require('fs');

// 读取配置文件
const configPath = './config.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 创建MySQL连接池
const pool = mysql.createPool(config.mysql.default);
const poolOnlySelect = mysql.createPool(config.mysql.select_only);

// 获取报表列表
router.get('/', (req, res) => {
    pool.query('SELECT * FROM reports', (error, results) => {
        if (error) throw error;
        res.render('reports', { reports: results });
    });
});

// 删除报表
router.post('/delete/:id', (req, res) => {
    const reportId = req.params.id;
    pool.query('DELETE FROM reports WHERE id = ?', [reportId], (error) => {
        if (error) throw error;
        res.redirect('/report');
    });
});

// 新增报表页面
router.get('/new', (req, res) => {
    res.render('report_form', { report: null, params: [] });
});

// 编辑报表页面
router.get('/edit/:id', (req, res) => {
    const reportId = req.params.id;

    // 获取报表信息
    pool.query('SELECT * FROM reports WHERE id = ?', [reportId], (error, reportResults) => {
        if (error) throw error;

        // 获取报表的参数
        pool.query('SELECT * FROM report_params WHERE report_id = ?', [reportId], (error, paramResults) => {
            if (error) throw error;
            res.render('report_form', { report: reportResults[0], params: paramResults });
        });
    });
});

// 新增报表逻辑
router.post('/new', (req, res) => {
    const { name, sql_query, new_param_name, new_param_title, new_param_default } = req.body;

    // 插入报表信息
    pool.query('INSERT INTO reports (name, sql_query) VALUES (?, ?)', [name, sql_query], (error, reportResult) => {
        if (error) throw error;

        const reportId = reportResult.insertId;

        // 如果有新增参数，插入参数
        if (new_param_name && new_param_title) {
            pool.query('INSERT INTO report_params (report_id, param_name, title, default_value) VALUES (?, ?, ?, ?)',
                [reportId, new_param_name, new_param_title, new_param_default],
                (error) => {
                    if (error) throw error;
                    res.redirect('/report');
                }
            );
        } else {
            res.redirect('/report');
        }
    });
});

// 编辑报表逻辑
router.post('/edit/:id', (req, res) => {
    const reportId = req.params.id;
    const { name, sql_query, new_param_name, new_param_title, new_param_default } = req.body;

    // 更新报表信息
    pool.query('UPDATE reports SET name = ?, sql_query = ? WHERE id = ?', [name, sql_query, reportId], (error) => {
        if (error) throw error;

        // 如果有新增参数，插入参数
        if (new_param_name && new_param_title) {
            pool.query('INSERT INTO report_params (report_id, param_name, title, default_value) VALUES (?, ?, ?, ?)',
                [reportId, new_param_name, new_param_title, new_param_default],
                (error) => {
                    if (error) throw error;
                    res.redirect('/report/edit/' + reportId);
                }
            );
        } else {
            res.redirect('/report');
        }
    });
});

// 删除参数
router.get('/delete_param/:id', (req, res) => {
    const paramId = req.params.id;
    pool.query('DELETE FROM report_params WHERE id = ?', [paramId], (error) => {
        if (error) throw error;
        res.redirect('back');
    });
});


// 查询报表，并展示可设置的参数
router.get('/query/:id', (req, res) => {
    const reportId = req.params.id;
    pool.query('SELECT * FROM reports WHERE id = ?', [reportId], (error, reportResults) => {
        if (error) throw error;

        // 获取报表对应的参数
        pool.query('SELECT * FROM report_params WHERE report_id = ?', [reportId], (error, paramResults) => {
            if (error) throw error;
            res.render('query_report', { report: reportResults[0], params: paramResults });
        });
    });
});

// 执行查询，并展示结果
router.post('/run_query/:id', (req, res) => {
    const reportId = req.params.id;
    const params = req.body;

    // 获取报表信息
    pool.query('SELECT * FROM reports WHERE id = ?', [reportId], (error, reportResults) => {
        if (error) throw error;

        let sqlQuery = reportResults[0].sql_query;

        // 获取参数的定义
        pool.query('SELECT * FROM report_params WHERE report_id = ?', [reportId], (error, paramResults) => {
            if (error) throw error;

            // 替换 SQL 中的参数占位符
            paramResults.forEach(param => {
                const paramName = param.param_name;
                const userValue = params[paramName];  // 用户输入的值
                const valueToUse = userValue || param.default_value;  // 优先使用用户输入的值，否则使用默认值

                // 替换 SQL 中的 #param_name# 占位符
                sqlQuery = sqlQuery.replace(new RegExp(`#${paramName}#`, 'g'), valueToUse);
            });

            // 把生成的 SQL 查询保存到 session 中，供导出功能使用
            req.session.sqlQuery = sqlQuery;

            // 执行查询
            poolOnlySelect.query(sqlQuery, (error, results) => {
                if (error) throw error;

                // 渲染结果页面
                res.render('query_results', {
                    report: reportResults[0],
                    results
                });
            });
        });
    });
});



// 导出查询结果到Excel
router.post('/export/:id', (req, res) => {
    const reportId = req.params.id;
    const sqlQuery = req.session.sqlQuery;  // 从 session 中获取 SQL 查询

    if (!sqlQuery) {
        return res.status(400).send('No SQL query available for export.');
    }

    // 执行 SQL 查询
    poolOnlySelect.query(sqlQuery, (error, queryResults) => {
        if (error) throw error;

        // 创建 Excel 工作簿
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Report');

        // 动态设置列
        worksheet.columns = Object.keys(queryResults[0]).map(key => ({
            header: key, key: key, width: 20
        }));

        // 填充数据
        queryResults.forEach(row => {
            worksheet.addRow(row);
        });

        // 设置响应头并发送 Excel 文件
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=report.xlsx');

        workbook.xlsx.write(res).then(() => {
            res.end();
        });
    });
});


module.exports = router;
