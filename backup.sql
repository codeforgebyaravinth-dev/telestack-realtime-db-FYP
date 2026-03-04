PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE projects (id TEXT PRIMARY KEY, owner_id TEXT, name TEXT, d1_database_id TEXT, isolation_type TEXT, region TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "projects" VALUES('f86e012d-20b0-4ae5-8b29-79eee830bad5','59d2b799-95b3-4354-81ae-13a464e099e4','Fresh Prod Project','1829a33f-1c1f-4061-9a96-6193e3f137c4','physical','apac','2026-02-15 11:56:55');
INSERT INTO "projects" VALUES('5772170b-24e9-418a-978c-306ac2bf35a8','7a54be48-dae4-4e51-ad2f-b35b01ecae84','Fresh Prod Project','d4320d32-5e73-464c-9983-1127c60733c3','physical','apac','2026-02-15 12:09:35');
INSERT INTO "projects" VALUES('c4efc971-9159-4265-b18d-c54e572b5952','02572708-9e54-483e-b54f-545d85105ca9','Fresh Prod Project','69374b6e-4d53-4b80-ae41-966dd40674c0','physical','apac','2026-02-15 12:22:30');
CREATE TABLE api_keys (id TEXT PRIMARY KEY, project_id TEXT, key_secret TEXT, key_type TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "api_keys" VALUES('00db5f26-bfe1-45a1-91f5-18e5a9888e2e','f86e012d-20b0-4ae5-8b29-79eee830bad5','sk_live_da7fdd698fd54e72869684f6d2eb5d88','public','2026-02-15 11:56:55');
INSERT INTO "api_keys" VALUES('c7a39385-85b3-41f9-8cd1-72f1b4707fa4','5772170b-24e9-418a-978c-306ac2bf35a8','sk_live_1a65438999e5487bb666846427645a88','public','2026-02-15 12:09:35');
INSERT INTO "api_keys" VALUES('649c866d-ca4f-488b-be1e-27c92d18a3e9','c4efc971-9159-4265-b18d-c54e572b5952','sk_live_2fab63c057194c848c5e8076629ba6e3','public','2026-02-15 12:22:30');
CREATE TABLE platform_users(
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "platform_users" VALUES('59d2b799-95b3-4354-81ae-13a464e099e4','fresh_start_1771156605881@example.com','p','Fresh Client','2026-02-15 11:56:51');
INSERT INTO "platform_users" VALUES('7a54be48-dae4-4e51-ad2f-b35b01ecae84','fresh_start_1771157367361@example.com','p','Fresh Client','2026-02-15 12:09:32');
INSERT INTO "platform_users" VALUES('02572708-9e54-483e-b54f-545d85105ca9','fresh_start_1771158138464@example.com','p','Fresh Client','2026-02-15 12:22:24');
CREATE TABLE documents(
        path TEXT NOT NULL,
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        parent_path TEXT NOT NULL DEFAULT "",
        depth INTEGER NOT NULL DEFAULT 0,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        version INTEGER DEFAULT 0,
        deleted_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(workspace_id, path)
    );
INSERT INTO "documents" VALUES('benchmarks/ce09b9a4-39b7-43c6-84eb-8548852883f2','ce09b9a4-39b7-43c6-84eb-8548852883f2','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}',1,NULL,'2026-02-16 05:27:02','2026-02-16 05:27:02');
INSERT INTO "documents" VALUES('benchmarks/639f0deb-ef57-4bba-8029-bc14b4ed6a21','639f0deb-ef57-4bba-8029-bc14b4ed6a21','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}',2,NULL,'2026-02-16 05:27:05','2026-02-16 05:27:05');
INSERT INTO "documents" VALUES('benchmarks/3d7eb448-a328-4c49-98ac-ff440597f3fc','3d7eb448-a328-4c49-98ac-ff440597f3fc','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}',3,NULL,'2026-02-16 05:27:08','2026-02-16 05:27:08');
INSERT INTO "documents" VALUES('benchmarks/85dc24da-3f30-4905-beef-33d8e6fdb1e3','85dc24da-3f30-4905-beef-33d8e6fdb1e3','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}',4,NULL,'2026-02-16 05:27:11','2026-02-16 05:27:11');
INSERT INTO "documents" VALUES('benchmarks/b88acdc2-1b18-4070-9ebc-89cc026eb6ce','b88acdc2-1b18-4070-9ebc-89cc026eb6ce','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}',5,NULL,'2026-02-16 05:27:14','2026-02-16 05:27:14');
INSERT INTO "documents" VALUES('benchmarks/test-doc-1','test-doc-1','default','benchmarks','',0,'benchmark-user','{"timestamp":"2/16/2026 11:06:03 AM","message":"Updated benchmark"}',60,'2026-02-16 05:36:14','2026-02-16 05:27:34','2026-02-16 05:36:10');
INSERT INTO "documents" VALUES('benchmarks/1b3eb45e-a933-4b53-8b9e-8bcc4580bd7e','1b3eb45e-a933-4b53-8b9e-8bcc4580bd7e','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}',11,NULL,'2026-02-16 05:29:43','2026-02-16 05:29:43');
INSERT INTO "documents" VALUES('benchmarks/3d5de964-aa77-4cee-90e6-8b9db9c5138b','3d5de964-aa77-4cee-90e6-8b9db9c5138b','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}',12,NULL,'2026-02-16 05:29:45','2026-02-16 05:29:45');
INSERT INTO "documents" VALUES('benchmarks/0671d13a-e3be-4c1e-8f4f-64c9b35cc365','0671d13a-e3be-4c1e-8f4f-64c9b35cc365','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}',13,NULL,'2026-02-16 05:29:46','2026-02-16 05:29:46');
INSERT INTO "documents" VALUES('benchmarks/b24dd91d-7843-49f4-a898-fdf379c6c6f5','b24dd91d-7843-49f4-a898-fdf379c6c6f5','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}',14,NULL,'2026-02-16 05:29:50','2026-02-16 05:29:50');
INSERT INTO "documents" VALUES('benchmarks/5385da10-fd90-409d-b497-bc9f421f1af8','5385da10-fd90-409d-b497-bc9f421f1af8','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}',15,NULL,'2026-02-16 05:29:51','2026-02-16 05:29:51');
INSERT INTO "documents" VALUES('benchmarks/f5d69cac-c155-49b5-b569-5b4f8336380b','f5d69cac-c155-49b5-b569-5b4f8336380b','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}',21,NULL,'2026-02-16 05:30:42','2026-02-16 05:30:42');
INSERT INTO "documents" VALUES('benchmarks/8397cc93-3998-4282-987a-58df1b37f0ac','8397cc93-3998-4282-987a-58df1b37f0ac','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}',22,NULL,'2026-02-16 05:30:43','2026-02-16 05:30:43');
INSERT INTO "documents" VALUES('benchmarks/ae9b9b64-1bac-4bb5-8852-2cfc47e264a5','ae9b9b64-1bac-4bb5-8852-2cfc47e264a5','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}',23,NULL,'2026-02-16 05:30:45','2026-02-16 05:30:45');
INSERT INTO "documents" VALUES('benchmarks/7ae3d5bc-15b7-448b-9609-59b89ff6020e','7ae3d5bc-15b7-448b-9609-59b89ff6020e','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}',24,NULL,'2026-02-16 05:30:47','2026-02-16 05:30:47');
INSERT INTO "documents" VALUES('benchmarks/ab0c9ca3-70a2-4df8-8fca-a4926d69c11e','ab0c9ca3-70a2-4df8-8fca-a4926d69c11e','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}',25,NULL,'2026-02-16 05:30:50','2026-02-16 05:30:50');
INSERT INTO "documents" VALUES('benchmarks/7b033615-912d-4624-a676-01bc7d012e47','7b033615-912d-4624-a676-01bc7d012e47','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}',31,NULL,'2026-02-16 05:32:38','2026-02-16 05:32:38');
INSERT INTO "documents" VALUES('benchmarks/d2930b09-57a3-4c2c-9bc3-0d47cf6f12b4','d2930b09-57a3-4c2c-9bc3-0d47cf6f12b4','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}',32,NULL,'2026-02-16 05:32:41','2026-02-16 05:32:41');
INSERT INTO "documents" VALUES('benchmarks/b2938acd-87bb-48de-8884-4da94c50ebad','b2938acd-87bb-48de-8884-4da94c50ebad','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}',33,NULL,'2026-02-16 05:32:43','2026-02-16 05:32:43');
INSERT INTO "documents" VALUES('benchmarks/39b1d33a-dcca-419a-a7ae-0338d96b8d02','39b1d33a-dcca-419a-a7ae-0338d96b8d02','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}',34,NULL,'2026-02-16 05:32:45','2026-02-16 05:32:45');
INSERT INTO "documents" VALUES('benchmarks/eccb110b-0151-48c5-8d10-e78f38437572','eccb110b-0151-48c5-8d10-e78f38437572','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}',35,NULL,'2026-02-16 05:32:46','2026-02-16 05:32:46');
INSERT INTO "documents" VALUES('benchmarks/2499f2f9-2d79-43b7-852f-fd4baaa1a539','2499f2f9-2d79-43b7-852f-fd4baaa1a539','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}',41,NULL,'2026-02-16 05:34:06','2026-02-16 05:34:06');
INSERT INTO "documents" VALUES('benchmarks/341d49f2-665f-4a08-b02c-672950258326','341d49f2-665f-4a08-b02c-672950258326','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}',42,NULL,'2026-02-16 05:34:07','2026-02-16 05:34:07');
INSERT INTO "documents" VALUES('benchmarks/2053feaa-b456-4196-a17b-05d65afb648f','2053feaa-b456-4196-a17b-05d65afb648f','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}',43,NULL,'2026-02-16 05:34:09','2026-02-16 05:34:09');
INSERT INTO "documents" VALUES('benchmarks/b6a266fb-7f46-4b54-a520-2903993b73f7','b6a266fb-7f46-4b54-a520-2903993b73f7','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}',44,NULL,'2026-02-16 05:34:10','2026-02-16 05:34:10');
INSERT INTO "documents" VALUES('benchmarks/113cb2b1-3578-4c01-a9b4-dc8546ed98b5','113cb2b1-3578-4c01-a9b4-dc8546ed98b5','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}',45,NULL,'2026-02-16 05:34:12','2026-02-16 05:34:12');
INSERT INTO "documents" VALUES('benchmarks/e6643524-3249-4f8b-b857-aebe84e5d60b','e6643524-3249-4f8b-b857-aebe84e5d60b','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}',51,NULL,'2026-02-16 05:35:43','2026-02-16 05:35:43');
INSERT INTO "documents" VALUES('benchmarks/e6338cde-37af-4c85-ba23-a358c1096881','e6338cde-37af-4c85-ba23-a358c1096881','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}',52,NULL,'2026-02-16 05:35:46','2026-02-16 05:35:46');
INSERT INTO "documents" VALUES('benchmarks/038e880b-0c7b-4df9-8333-219182ff56bb','038e880b-0c7b-4df9-8333-219182ff56bb','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}',53,NULL,'2026-02-16 05:35:48','2026-02-16 05:35:48');
INSERT INTO "documents" VALUES('benchmarks/ad49acc7-5b2d-47d8-a02a-2886295778c6','ad49acc7-5b2d-47d8-a02a-2886295778c6','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}',54,NULL,'2026-02-16 05:35:50','2026-02-16 05:35:50');
INSERT INTO "documents" VALUES('benchmarks/5e2aba15-5db5-44b2-b893-5a57fd3bda6d','5e2aba15-5db5-44b2-b893-5a57fd3bda6d','default','benchmarks','',2,'benchmark-user','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}',55,NULL,'2026-02-16 05:35:53','2026-02-16 05:35:53');
CREATE TABLE events(
        version INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "events" VALUES(1,'d9757f07-ec95-4052-b1f2-53b1a314b276','ce09b9a4-39b7-43c6-84eb-8548852883f2','default','INSERT','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}','2026-02-16 05:27:02');
INSERT INTO "events" VALUES(2,'6edafc2c-d3f9-434f-a649-a0484ae61730','639f0deb-ef57-4bba-8029-bc14b4ed6a21','default','INSERT','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}','2026-02-16 05:27:05');
INSERT INTO "events" VALUES(3,'3ae2cd06-3e3a-4879-a5f4-6d2f17f4280b','3d7eb448-a328-4c49-98ac-ff440597f3fc','default','INSERT','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}','2026-02-16 05:27:08');
INSERT INTO "events" VALUES(4,'70f350ec-4878-45fb-b074-26125ff42566','85dc24da-3f30-4905-beef-33d8e6fdb1e3','default','INSERT','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}','2026-02-16 05:27:11');
INSERT INTO "events" VALUES(5,'97cc8953-7384-4920-a49c-feb400189b02','b88acdc2-1b18-4070-9ebc-89cc026eb6ce','default','INSERT','{"timestamp":"2/16/2026 10:56:54 AM","message":"Benchmark test"}','2026-02-16 05:27:14');
INSERT INTO "events" VALUES(6,'74004f53-6d5f-4413-8474-225822d59a3a','test-doc-1','default','SET','{"timestamp":"2/16/2026 10:57:33 AM","message":"Updated benchmark"}','2026-02-16 05:27:34');
INSERT INTO "events" VALUES(7,'90b52bcf-d474-4843-9b8e-526c4cc1f01b','test-doc-1','default','SET','{"timestamp":"2/16/2026 10:57:33 AM","message":"Updated benchmark"}','2026-02-16 05:27:35');
INSERT INTO "events" VALUES(8,'6ea7b5b4-05d6-4c3d-8224-1866ab49283a','test-doc-1','default','SET','{"timestamp":"2/16/2026 10:57:33 AM","message":"Updated benchmark"}','2026-02-16 05:27:36');
INSERT INTO "events" VALUES(9,'b8de84e0-8ebe-4815-aada-98031b8c0077','test-doc-1','default','SET','{"timestamp":"2/16/2026 10:57:33 AM","message":"Updated benchmark"}','2026-02-16 05:27:37');
INSERT INTO "events" VALUES(10,'3cb65ea3-2a98-4d1e-9894-d56c4e6086b5','test-doc-1','default','SET','{"timestamp":"2/16/2026 10:57:33 AM","message":"Updated benchmark"}','2026-02-16 05:27:40');
INSERT INTO "events" VALUES(11,'06aa62a6-10dd-443b-a92e-f8c8932dfa74','1b3eb45e-a933-4b53-8b9e-8bcc4580bd7e','default','INSERT','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}','2026-02-16 05:29:43');
INSERT INTO "events" VALUES(12,'e7043fa7-a3eb-4abd-a309-2147f2b87e59','3d5de964-aa77-4cee-90e6-8b9db9c5138b','default','INSERT','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}','2026-02-16 05:29:44');
INSERT INTO "events" VALUES(13,'3a708d90-71f8-4c56-ab2a-ea41c792a4a1','0671d13a-e3be-4c1e-8f4f-64c9b35cc365','default','INSERT','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}','2026-02-16 05:29:46');
INSERT INTO "events" VALUES(14,'15aaf55a-d68b-4217-ab3a-c9021bef9627','b24dd91d-7843-49f4-a898-fdf379c6c6f5','default','INSERT','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}','2026-02-16 05:29:50');
INSERT INTO "events" VALUES(15,'b524b9f7-c098-4aa5-9b81-7f1be11bb49d','5385da10-fd90-409d-b497-bc9f421f1af8','default','INSERT','{"timestamp":"2/16/2026 10:59:39 AM","message":"Benchmark test"}','2026-02-16 05:29:51');
INSERT INTO "events" VALUES(16,'485dbc66-4c89-483c-8211-9dac474c1908','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:05 AM","message":"Updated benchmark"}','2026-02-16 05:30:06');
INSERT INTO "events" VALUES(17,'e9efa186-e275-4367-8116-98f92cf394ec','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:05 AM","message":"Updated benchmark"}','2026-02-16 05:30:07');
INSERT INTO "events" VALUES(18,'f2f3cb2f-7af0-4474-b4a8-e49e09e14118','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:05 AM","message":"Updated benchmark"}','2026-02-16 05:30:08');
INSERT INTO "events" VALUES(19,'2e1caaf4-3083-4b3f-ba55-0a9d8ec0cc25','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:05 AM","message":"Updated benchmark"}','2026-02-16 05:30:10');
INSERT INTO "events" VALUES(20,'5b930f93-12dc-4d44-b455-a4e5e3a5e7c8','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:05 AM","message":"Updated benchmark"}','2026-02-16 05:30:11');
INSERT INTO "events" VALUES(21,'3debaa11-388b-4f86-8242-22ab67f01bbd','f5d69cac-c155-49b5-b569-5b4f8336380b','default','INSERT','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}','2026-02-16 05:30:42');
INSERT INTO "events" VALUES(22,'e51eced9-4ab0-45ab-aa4d-ae884976ef22','8397cc93-3998-4282-987a-58df1b37f0ac','default','INSERT','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}','2026-02-16 05:30:43');
INSERT INTO "events" VALUES(23,'077bbc2d-7b34-462d-ba5c-5ab856b02441','ae9b9b64-1bac-4bb5-8852-2cfc47e264a5','default','INSERT','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}','2026-02-16 05:30:45');
INSERT INTO "events" VALUES(24,'a7f9964d-4d72-4885-8b6e-6a9bf54f9f39','7ae3d5bc-15b7-448b-9609-59b89ff6020e','default','INSERT','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}','2026-02-16 05:30:47');
INSERT INTO "events" VALUES(25,'10bb0c2c-94f3-4b8f-86a6-cd24d9fbf750','ab0c9ca3-70a2-4df8-8fca-a4926d69c11e','default','INSERT','{"timestamp":"2/16/2026 11:00:39 AM","message":"Benchmark test"}','2026-02-16 05:30:50');
INSERT INTO "events" VALUES(26,'fc99f8cf-197a-4715-ba64-9e7bdbe39c12','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:59 AM","message":"Updated benchmark"}','2026-02-16 05:31:00');
INSERT INTO "events" VALUES(27,'272f9694-2114-4d6c-b847-3bfde0d5c938','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:59 AM","message":"Updated benchmark"}','2026-02-16 05:31:02');
INSERT INTO "events" VALUES(28,'5b04b2b5-6f6d-4c71-8806-66ab37b3abc6','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:59 AM","message":"Updated benchmark"}','2026-02-16 05:31:03');
INSERT INTO "events" VALUES(29,'af0e070b-99c6-44b3-b64b-b22f96cc74c6','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:59 AM","message":"Updated benchmark"}','2026-02-16 05:31:04');
INSERT INTO "events" VALUES(30,'fa73cb71-a3db-4fa6-99fc-13a25267ef3d','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:00:59 AM","message":"Updated benchmark"}','2026-02-16 05:31:05');
INSERT INTO "events" VALUES(31,'4e60e690-2b84-40bd-9d84-face986f328c','7b033615-912d-4624-a676-01bc7d012e47','default','INSERT','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}','2026-02-16 05:32:38');
INSERT INTO "events" VALUES(32,'c7b1b3ad-42b4-4809-9c9c-47f3114f1c47','d2930b09-57a3-4c2c-9bc3-0d47cf6f12b4','default','INSERT','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}','2026-02-16 05:32:41');
INSERT INTO "events" VALUES(33,'cff6ae12-f7e1-4577-bec5-c2267467f275','b2938acd-87bb-48de-8884-4da94c50ebad','default','INSERT','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}','2026-02-16 05:32:42');
INSERT INTO "events" VALUES(34,'6632530f-dbde-458d-ac06-01fd0f7e59de','39b1d33a-dcca-419a-a7ae-0338d96b8d02','default','INSERT','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}','2026-02-16 05:32:45');
INSERT INTO "events" VALUES(35,'1468a984-01b1-4e88-9010-284c3b8cad17','eccb110b-0151-48c5-8d10-e78f38437572','default','INSERT','{"timestamp":"2/16/2026 11:02:36 AM","message":"Benchmark test"}','2026-02-16 05:32:46');
INSERT INTO "events" VALUES(36,'e09fa590-0594-424b-a2da-15b044d7629d','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:02:57 AM","message":"Updated benchmark"}','2026-02-16 05:32:59');
INSERT INTO "events" VALUES(37,'d1ac8a73-3fd5-42b8-879c-a43f6704bab5','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:02:57 AM","message":"Updated benchmark"}','2026-02-16 05:33:00');
INSERT INTO "events" VALUES(38,'ca221913-5fa4-49f0-ad9d-b46dc6b4194f','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:02:57 AM","message":"Updated benchmark"}','2026-02-16 05:33:01');
INSERT INTO "events" VALUES(39,'d7062717-2001-43bd-ab23-74cd7c2d5ce4','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:02:57 AM","message":"Updated benchmark"}','2026-02-16 05:33:03');
INSERT INTO "events" VALUES(40,'5079edb5-a3af-40cd-ad86-8174f4077849','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:02:57 AM","message":"Updated benchmark"}','2026-02-16 05:33:05');
INSERT INTO "events" VALUES(41,'29a8d95a-c305-464f-8935-448e4965dde9','2499f2f9-2d79-43b7-852f-fd4baaa1a539','default','INSERT','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}','2026-02-16 05:34:06');
INSERT INTO "events" VALUES(42,'c56ae2d9-0812-42bb-8480-ba5cb7d00f76','341d49f2-665f-4a08-b02c-672950258326','default','INSERT','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}','2026-02-16 05:34:07');
INSERT INTO "events" VALUES(43,'7916bfe3-89cb-47e4-9c7b-0c84725071a2','2053feaa-b456-4196-a17b-05d65afb648f','default','INSERT','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}','2026-02-16 05:34:09');
INSERT INTO "events" VALUES(44,'1c578a4d-d297-4c39-bdda-e972521777c9','b6a266fb-7f46-4b54-a520-2903993b73f7','default','INSERT','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}','2026-02-16 05:34:10');
INSERT INTO "events" VALUES(45,'3ae6865e-6b48-4f75-bfc8-3697721d4e88','113cb2b1-3578-4c01-a9b4-dc8546ed98b5','default','INSERT','{"timestamp":"2/16/2026 11:04:03 AM","message":"Benchmark test"}','2026-02-16 05:34:12');
INSERT INTO "events" VALUES(46,'c0b98c98-8470-4218-8f2b-a80123fed7ff','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:04:25 AM","message":"Updated benchmark"}','2026-02-16 05:34:26');
INSERT INTO "events" VALUES(47,'ae6bc7bb-10a5-4f8c-8b4e-ff9ce65e13ff','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:04:25 AM","message":"Updated benchmark"}','2026-02-16 05:34:27');
INSERT INTO "events" VALUES(48,'96d737bf-d1ad-4df6-af52-d4b23706e1fe','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:04:25 AM","message":"Updated benchmark"}','2026-02-16 05:34:29');
INSERT INTO "events" VALUES(49,'c2eec0df-fd61-4715-9246-d1ef12403855','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:04:25 AM","message":"Updated benchmark"}','2026-02-16 05:34:30');
INSERT INTO "events" VALUES(50,'1add0396-e2c6-4028-b348-8851b78f184d','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:04:25 AM","message":"Updated benchmark"}','2026-02-16 05:34:31');
INSERT INTO "events" VALUES(51,'01698dc0-ace2-4680-b3c9-c01dabbd85f1','e6643524-3249-4f8b-b857-aebe84e5d60b','default','INSERT','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}','2026-02-16 05:35:43');
INSERT INTO "events" VALUES(52,'963e8969-7bcf-437a-a940-d84b4c69c21f','e6338cde-37af-4c85-ba23-a358c1096881','default','INSERT','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}','2026-02-16 05:35:46');
INSERT INTO "events" VALUES(53,'abbf2b2f-feca-41ed-9fa4-9401148ca95f','038e880b-0c7b-4df9-8333-219182ff56bb','default','INSERT','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}','2026-02-16 05:35:48');
INSERT INTO "events" VALUES(54,'5e54ed4f-57c7-4de2-87d5-b26af48d9dc2','ad49acc7-5b2d-47d8-a02a-2886295778c6','default','INSERT','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}','2026-02-16 05:35:49');
INSERT INTO "events" VALUES(55,'3820244c-0093-47da-a4db-26f9405ee45e','5e2aba15-5db5-44b2-b893-5a57fd3bda6d','default','INSERT','{"timestamp":"2/16/2026 11:05:41 AM","message":"Benchmark test"}','2026-02-16 05:35:52');
INSERT INTO "events" VALUES(56,'170cf804-4432-4317-8c19-3b4f267b37da','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:06:03 AM","message":"Updated benchmark"}','2026-02-16 05:36:04');
INSERT INTO "events" VALUES(57,'5b5a9757-edf2-4ea5-980c-14bdf18f57d7','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:06:03 AM","message":"Updated benchmark"}','2026-02-16 05:36:06');
INSERT INTO "events" VALUES(58,'5d068cc3-6518-48ef-ac17-abc8f3f961e9','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:06:03 AM","message":"Updated benchmark"}','2026-02-16 05:36:07');
INSERT INTO "events" VALUES(59,'2d318c6b-510d-409f-8218-a16933037e2a','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:06:03 AM","message":"Updated benchmark"}','2026-02-16 05:36:08');
INSERT INTO "events" VALUES(60,'e3f9a32d-1fa0-44dd-b308-55cd29b63b4e','test-doc-1','default','SET','{"timestamp":"2/16/2026 11:06:03 AM","message":"Updated benchmark"}','2026-02-16 05:36:09');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" VALUES('events',60);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_api_keys_secret ON api_keys(key_secret);
CREATE INDEX idx_events_workspace ON events(workspace_id);
CREATE INDEX idx_doc_workspace ON documents(workspace_id);
CREATE INDEX idx_doc_collection ON documents(collection_name);
CREATE INDEX idx_docs_covering ON documents(
        workspace_id, parent_path, depth, collection_name, path, data
    ) WHERE deleted_at IS NULL
        ;
