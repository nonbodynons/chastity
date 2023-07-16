CREATE TABLE users (
  userId uuid NOT NULL,
  accessToken varchar(2048),
  refreshToken varchar(2048) NOT NULL,
  PRIMARY KEY (userId)
);
