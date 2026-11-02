# 批量导入员工

部署前运行 `pnpm db:migrate`，创建 `tenant_api_keys` 表。团队管理页中有“批量导入员工”和“员工导入 API Key”两个区域，需要 `team.manage` 权限。

## Excel

下载模板，按“姓名、邮箱、初始密码”三列填写第一个工作表，然后上传 `.xlsx`。每批 1–100 位员工，最多 1 MB，解压后最多 8 MB。单元格须为纯文本，不接受公式。新账号初始密码至少 8 位、最多 72 UTF-8 字节；密码列建议保持文本格式以保留前导零。初始密码由管理员安全交付员工，系统不发送邮件。

姓名和邮箱必填，邮箱统一去除首尾空格并转小写。已有本团队账号不修改姓名和密码；已生效成员跳过，待审核或已拒绝成员通过为普通成员。当前登录流程仅支持单租户账号，其他团队的账号会返回行级错误。所有导入成员只有基础访问权限，不支持通过导入授予管理权限。

字段格式不合法时返回 400，整批不执行；缺少新账号密码、其他团队账号等业务错误按行返回，其余员工正常导入。发生数据库错误时整批回滚。

## API Key

团队管理页创建命名密钥，完整原文仅创建时返回一次，请立即保存。有效期 90 天，数据库仅存 SHA-256。可在页面撤销。密钥只绑定创建时的租户，只允许调用导入端点，创建者失去 `team.manage` 权限或成员资格后也无法使用。同一密钥成功请求间隔至少 1 秒，过于频繁返回 429；网络重试可以安全重发，已存在的成员跳过。

```sh
export APP_URL='http://app.lvh.me:6101'
# API_KEY 从密钥管理系统注入，不要写入代码或日志。
curl --fail-with-body -X POST "$APP_URL/api/team/import" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"employees":[{"name":"张三","email":"zhangsan@example.com","password":"CHANGE_THIS_PASSWORD"}]}'
```

接口只接受顶层 `employees` 数组；每项只支持 `name`、`email`、`password`。不要传 `tenantId`、`role` 或 `permissions`，目标团队始终从会话或 Key 获取。

同一端点支持直接提交 XLSX 字节（不是 multipart）：

```sh
curl --fail-with-body -X POST "$APP_URL/api/team/import" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' \
  --data-binary @employees.xlsx
```

成功响应（HTTP 200，业务错误见 `failed` 和 `results`）：

```json
{
  "added": 1,
  "skipped": 0,
  "failed": 0,
  "results": [
    { "row": 1, "email": "zhangsan@example.com", "status": "added", "message": "已加入团队" }
  ]
}
```

`row` 为员工记录序号（不含表头和空行）。响应不会回传密码。错误状态码：400 无效输入，401 未认证或密钥失效，403 无权限，413 内容过大，415 不支持的类型，429 调用过于频繁，500 本批次事务失败。

密钥管理端点只接受登录会话，不接受 API Key：

- `GET /api/team/api-keys`：当前团队密钥列表，不包含哈希或密钥原文。
- `POST /api/team/api-keys`：`{"name":"HR 系统同步"}`，返回新密钥原文和元数据，HTTP 201。
- `DELETE /api/team/api-keys`：`{"id":"密钥 UUID"}`，撤销当前团队的密钥。
- `GET /api/team/import/template`：下载空白 Excel 模板。
