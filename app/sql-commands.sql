-- Table: public.issues

-- DROP TABLE public.issues;

CREATE TABLE public.issues
(
  id integer NOT NULL DEFAULT nextval('"issues_ID_seq"'::regclass),
  url character varying(100),
  repository_url character varying(100),
  git_issue_id integer,
  title character varying(100),
  user_id integer,
  body text,
  CONSTRAINT issues_pkey PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE public.issues
  OWNER TO postgres;



-- Table: public.permissions

-- DROP TABLE public.permissions;

CREATE TABLE public.permissions
(
  id integer NOT NULL,
  name character varying(100),
  CONSTRAINT permissions_pkey PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE public.permissions
  OWNER TO postgres;

-- 1;"list_public_repo"
-- 2;"list_own_repos_issues"
-- 3;"buy_packages"
-- 4;"create_packages"





-- Table: public.repositories

-- DROP TABLE public.repositories;

CREATE TABLE public.repositories
(
  id integer NOT NULL DEFAULT nextval('"repositories_ID_seq"'::regclass),
  user_id integer,
  git_project_id integer,
  project_name character varying(100),
  full_project_name character varying(100),
  html_url character varying(100),
  description character varying(100),
  api_url character varying(100),
  CONSTRAINT repositories_pkey PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE public.repositories
  OWNER TO postgres;



-- Table: public.roles

-- DROP TABLE public.roles;

CREATE TABLE public.roles
(
  id integer NOT NULL,
  name character varying(100),
  CONSTRAINT roles_pkey PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE public.roles
  OWNER TO postgres;

-- 1;"public"
-- 2;"basic"
-- 3;"supporter"






-- Table: public.roles_permissions

-- DROP TABLE public.roles_permissions;

CREATE TABLE public.roles_permissions
(
  id integer NOT NULL,
  role_id integer,
  permission_id integer,
  CONSTRAINT roles_permission_pkey PRIMARY KEY (id),
  CONSTRAINT permission_id_fkey FOREIGN KEY (permission_id)
      REFERENCES public.permissions (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT role_id_fkey FOREIGN KEY (role_id)
      REFERENCES public.roles (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE NO ACTION
)
WITH (
  OIDS=FALSE
);
ALTER TABLE public.roles_permissions
  OWNER TO postgres;


-- 1;1;1
-- 2;2;1
-- 3;2;2
-- 4;2;3
-- 5;3;1
-- 6;3;4







-- Table: public.user_details

-- DROP TABLE public.user_details;

CREATE TABLE public.user_details
(
  login character varying(30),
  github_user_id integer,
  html_url character varying(100),
  repos_url character varying(100),
  id bigint NOT NULL DEFAULT nextval('user_details_id_seq'::regclass),
  token character varying(100),
  role_id integer,
  CONSTRAINT user_details_pkey PRIMARY KEY (id),
  CONSTRAINT roles_fkey FOREIGN KEY (role_id)
      REFERENCES public.roles (id) MATCH SIMPLE
      ON UPDATE NO ACTION ON DELETE NO ACTION
)
WITH (
  OIDS=FALSE
);
ALTER TABLE public.user_details
  OWNER TO postgres;

-- Index: public.fki_roles_fkey

-- DROP INDEX public.fki_roles_fkey;

CREATE INDEX fki_roles_fkey
  ON public.user_details
  USING btree
  (role_id);



-- Table: public.repositories

-- DROP TABLE public.repositories;

CREATE TABLE public.packages
(
  id serial NOT NULL,
  name character varying(100),
  price numeric,
  CONSTRAINT packages_pkey PRIMARY KEY (id)
)
WITH (
  OIDS=FALSE
);
ALTER TABLE public.packages
  OWNER TO postgres;
