-- 表结构
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS security (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);
CREATE TABLE IF NOT EXISTS parking (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL,
  category TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
  contact TEXT, result TEXT, capacity INTEGER CHECK(capacity >= 0), used INTEGER CHECK(used >= 0), owner TEXT,
  facilityId TEXT REFERENCES facilities(id), buildingId TEXT REFERENCES buildings(id),
  submitterId TEXT, assigneeId TEXT, timeSlot TEXT, count INTEGER CHECK(count > 0)
);

-- 关联查询，参数：[taskId]
SELECT t.id, t.title, t.status, t.submitterId, t.assigneeId,
  f.id AS facilityId, f.title AS facilityTitle, b.id AS buildingId, b.title AS buildingTitle
FROM tasks t JOIN facilities f ON t.facilityId = f.id
JOIN buildings b ON f.buildingId = b.id WHERE t.id = ?;

-- 初始化写入，按字段顺序绑定参数
INSERT INTO buildings (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO people (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO facilities (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO tasks (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO inspections (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO bookings (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO notices (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO security (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO visitors (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);
INSERT INTO parking (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);

-- 维护记录：参数来自已校验的字段
INSERT INTO buildings (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,category=excluded.category,status=excluded.status,description=excluded.description,date=excluded.date,contact=excluded.contact,result=excluded.result,capacity=excluded.capacity,used=excluded.used,owner=excluded.owner,facilityId=excluded.facilityId,buildingId=excluded.buildingId,submitterId=excluded.submitterId,assigneeId=excluded.assigneeId,timeSlot=excluded.timeSlot,count=excluded.count;
INSERT INTO people (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,category=excluded.category,status=excluded.status,description=excluded.description,date=excluded.date,contact=excluded.contact,result=excluded.result,capacity=excluded.capacity,used=excluded.used,owner=excluded.owner,facilityId=excluded.facilityId,buildingId=excluded.buildingId,submitterId=excluded.submitterId,assigneeId=excluded.assigneeId,timeSlot=excluded.timeSlot,count=excluded.count;
INSERT INTO facilities (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,category=excluded.category,status=excluded.status,description=excluded.description,date=excluded.date,contact=excluded.contact,result=excluded.result,capacity=excluded.capacity,used=excluded.used,owner=excluded.owner,facilityId=excluded.facilityId,buildingId=excluded.buildingId,submitterId=excluded.submitterId,assigneeId=excluded.assigneeId,timeSlot=excluded.timeSlot,count=excluded.count;
INSERT INTO tasks (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,category=excluded.category,status=excluded.status,description=excluded.description,date=excluded.date,contact=excluded.contact,result=excluded.result,capacity=excluded.capacity,used=excluded.used,owner=excluded.owner,facilityId=excluded.facilityId,buildingId=excluded.buildingId,submitterId=excluded.submitterId,assigneeId=excluded.assigneeId,timeSlot=excluded.timeSlot,count=excluded.count;
INSERT INTO inspections (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,category=excluded.category,status=excluded.status,description=excluded.description,date=excluded.date,contact=excluded.contact,result=excluded.result,capacity=excluded.capacity,used=excluded.used,owner=excluded.owner,facilityId=excluded.facilityId,buildingId=excluded.buildingId,submitterId=excluded.submitterId,assigneeId=excluded.assigneeId,timeSlot=excluded.timeSlot,count=excluded.count;
INSERT INTO bookings (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,category=excluded.category,status=excluded.status,description=excluded.description,date=excluded.date,contact=excluded.contact,result=excluded.result,capacity=excluded.capacity,used=excluded.used,owner=excluded.owner,facilityId=excluded.facilityId,buildingId=excluded.buildingId,submitterId=excluded.submitterId,assigneeId=excluded.assigneeId,timeSlot=excluded.timeSlot,count=excluded.count;
INSERT INTO notices (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,category=excluded.category,status=excluded.status,description=excluded.description,date=excluded.date,contact=excluded.contact,result=excluded.result,capacity=excluded.capacity,used=excluded.used,owner=excluded.owner,facilityId=excluded.facilityId,buildingId=excluded.buildingId,submitterId=excluded.submitterId,assigneeId=excluded.assigneeId,timeSlot=excluded.timeSlot,count=excluded.count;
INSERT INTO security (id,title,location,category,status,description,date,contact,result,capacity,used,owner,facilityId,buildingId,submitterId,assigneeId,timeSlot,count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,location=excluded.location,category=excluded.category,status=excluded.status,description=excluded.description,date=excluded.date,contact=excluded.contact,result=excluded.result,capacity=excluded.capacity,used=excluded.used,owner=excluded.owner,facilityId=excluded.facilityId,buildingId=excluded.buildingId,submitterId=excluded.submitterId,assigneeId=excluded.assigneeId,timeSlot=excluded.timeSlot,count=excluded.count;
