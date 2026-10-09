-- name: FindUser :one
SELECT id,username,password,COALESCE(role::text,'operador')::text AS role,email,"tokenVersion",COALESCE("mustChangePassword",true) AS must_change_password,COALESCE("loginAttempts",0) AS login_attempts,"lockedUntil" FROM "Users" WHERE username=$1;

-- name: FindUserByID :one
SELECT id,username,password,COALESCE(role::text,'operador')::text AS role,email,"tokenVersion",COALESCE("mustChangePassword",true) AS must_change_password,COALESCE("loginAttempts",0) AS login_attempts,"lockedUntil" FROM "Users" WHERE id=$1;

-- name: LockUser :one
SELECT id,username,password,COALESCE(role::text,'operador')::text AS role,email,"tokenVersion",COALESCE("mustChangePassword",true) AS must_change_password,COALESCE("loginAttempts",0) AS login_attempts,"lockedUntil" FROM "Users" WHERE username=$1 FOR UPDATE;

-- name: LoginSucceeded :exec
UPDATE "Users" SET "loginAttempts"=0,"lockedUntil"=null,"updatedAt"=now() WHERE id=$1;

-- name: LoginFailed :exec
UPDATE "Users" SET "loginAttempts"=$2,"lockedUntil"=$3,"updatedAt"=now() WHERE id=$1;

-- name: SaveResetToken :exec
UPDATE "Users" SET "resetToken"=$2,"resetTokenExpiry"=$3,"updatedAt"=now() WHERE id=$1;

-- name: ConsumeResetToken :one
UPDATE "Users" SET password=$2,"resetToken"=null,"resetTokenExpiry"=null,"mustChangePassword"=false,"passwordChangedAt"=now(),"tokenVersion"="tokenVersion"+1,"loginAttempts"=0,"lockedUntil"=null,"updatedAt"=now() WHERE "resetToken"=$1 AND "resetTokenExpiry">now() RETURNING id,username,role::text AS role;

-- name: ChangePassword :execrows
UPDATE "Users" SET password=$2,"mustChangePassword"=$3,"passwordChangedAt"=now(),"tokenVersion"="tokenVersion"+1,"resetToken"=null,"resetTokenExpiry"=null,"loginAttempts"=0,"lockedUntil"=null,"updatedAt"=now() WHERE id=$1 AND "tokenVersion"=$4;

-- name: WriteAudit :exec
INSERT INTO "ActivityLogs"("userId",username,action,entity,"entityId",details,"ipAddress","userAgent","createdAt",role,method,path,status,"statusCode") VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9,$10,$11,'success',200);

-- name: ListUsers :many
SELECT id,username,email,role::text AS role,"mustChangePassword","loginAttempts","lockedUntil" FROM "Users" ORDER BY id;

-- name: FindVisitor :one
SELECT * FROM "Visitors" WHERE cedula=$1 AND "anonymizedAt" IS NULL;

-- name: LockVisitor :one
SELECT * FROM "Visitors" WHERE cedula=$1 AND "anonymizedAt" IS NULL FOR UPDATE;

-- name: FindVisit :one
SELECT * FROM "Visits" WHERE id=$1;

-- name: LockVisit :one
SELECT * FROM "Visits" WHERE id=$1 FOR UPDATE;

-- name: VisitLogs :many
SELECT * FROM "IntermittentLogs" WHERE visit_id=$1 ORDER BY check_out;

-- name: FindVisitorByID :one
SELECT * FROM "Visitors" WHERE id=$1;
