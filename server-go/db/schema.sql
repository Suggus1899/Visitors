--
-- PostgreSQL database dump
--



-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15












--
-- Name: enum_ActivityLogs_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_ActivityLogs_severity" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);


--
-- Name: enum_ActivityLogs_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_ActivityLogs_status" AS ENUM (
    'success',
    'failure'
);


--
-- Name: enum_ArcoRequests_requestType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_ArcoRequests_requestType" AS ENUM (
    'access',
    'rectification',
    'cancellation',
    'opposition'
);


--
-- Name: enum_ArcoRequests_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_ArcoRequests_status" AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'rejected'
);


--
-- Name: enum_Users_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_Users_role" AS ENUM (
    'root',
    'admin',
    'operador',
    'auditor',
    'demo'
);


--
-- Name: enum_Visits_action; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_Visits_action" AS ENUM (
    'Carga',
    'Descarga',
    'Ninguna'
);


--
-- Name: enum_Visits_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_Visits_status" AS ENUM (
    'waiting',
    'active',
    'intermittent',
    'completed'
);






--
-- Name: ActivityLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ActivityLogs" (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    username character varying(255) NOT NULL,
    action character varying(255) NOT NULL,
    entity character varying(255) NOT NULL,
    "entityId" character varying(255) NOT NULL,
    details text,
    "ipAddress" character varying(255),
    "userAgent" character varying(500),
    "createdAt" timestamp with time zone,
    method character varying(10),
    path character varying(255),
    "statusCode" integer,
    duration integer,
    severity character varying(20) DEFAULT 'low'::character varying,
    role character varying(20),
    resource character varying(50),
    "resourceId" integer,
    status character varying(20) DEFAULT 'success'::character varying
);


--
-- Name: ActivityLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ActivityLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ActivityLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ActivityLogs_id_seq" OWNED BY public."ActivityLogs".id;


--
-- Name: ArcoRequests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ArcoRequests" (
    id integer NOT NULL,
    "requestType" public."enum_ArcoRequests_requestType" NOT NULL,
    "subjectCedulaHash" character varying(64) NOT NULL,
    "subjectCedulaEncrypted" text,
    "requestedByName" character varying(120) NOT NULL,
    "requestedByUserId" integer,
    "contactEmail" character varying(200),
    reason text,
    "requestPayload" text,
    status public."enum_ArcoRequests_status" DEFAULT 'pending'::public."enum_ArcoRequests_status" NOT NULL,
    "resolutionNotes" text,
    "resolvedAt" timestamp with time zone,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone
);


--
-- Name: ArcoRequests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ArcoRequests_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ArcoRequests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ArcoRequests_id_seq" OWNED BY public."ArcoRequests".id;


--
-- Name: Departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Departments" (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20),
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: Departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Departments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Departments_id_seq" OWNED BY public."Departments".id;


--
-- Name: IntermittentLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IntermittentLogs" (
    id integer NOT NULL,
    visit_id integer NOT NULL,
    check_out timestamp with time zone NOT NULL,
    re_entry timestamp with time zone,
    notes text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    registered_by text
);


--
-- Name: IntermittentLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."IntermittentLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: IntermittentLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."IntermittentLogs_id_seq" OWNED BY public."IntermittentLogs".id;


--
-- Name: SequelizeMeta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SequelizeMeta" (
    name character varying(255) NOT NULL
);


--
-- Name: Users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Users" (
    id integer NOT NULL,
    username character varying(255) NOT NULL,
    email character varying(255),
    "tokenVersion" integer DEFAULT 0 NOT NULL,
    password character varying(255) NOT NULL,
    role public."enum_Users_role" DEFAULT 'operador'::public."enum_Users_role",
    "resetToken" character varying(255),
    "resetTokenExpiry" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "mustChangePassword" boolean DEFAULT true,
    "passwordChangedAt" timestamp with time zone,
    "loginAttempts" integer DEFAULT 0,
    "lockedUntil" timestamp with time zone
);


--
-- Name: Users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Users_id_seq" OWNED BY public."Users".id;


--
-- Name: VisitPurposes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VisitPurposes" (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: VisitPurposes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."VisitPurposes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: VisitPurposes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."VisitPurposes_id_seq" OWNED BY public."VisitPurposes".id;


--
-- Name: VisitorEditHistories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VisitorEditHistories" (
    id integer NOT NULL,
    "visitId" integer,
    "visitorId" integer NOT NULL,
    field character varying(100) NOT NULL,
    "oldValue" text,
    "newValue" text,
    "editedBy" integer NOT NULL,
    "editedByUsername" character varying(255) NOT NULL,
    "editedAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);


--
-- Name: VisitorEditHistories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."VisitorEditHistories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: VisitorEditHistories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."VisitorEditHistories_id_seq" OWNED BY public."VisitorEditHistories".id;


--
-- Name: Visitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Visitors" (
    id integer NOT NULL,
    "anonymizedAt" timestamp with time zone,
    cedula character varying(255) NOT NULL,
    encrypted_cedula character varying(255),
    first_name text NOT NULL,
    last_name text NOT NULL,
    company character varying(255) NOT NULL,
    job_title text,
    photo_url character varying(255),
    id_photo_url character varying(255),
    email text,
    phone text,
    "updatedAt" timestamp with time zone NOT NULL,
    photo_data bytea,
    id_photo_data bytea,
    "isBlocked" boolean DEFAULT false,
    observations text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: Visitors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Visitors_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Visitors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Visitors_id_seq" OWNED BY public."Visitors".id;


--
-- Name: Visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Visits" (
    id integer NOT NULL,
    visitor_cedula character varying(255) NOT NULL,
    purpose character varying(255) NOT NULL,
    person_to_visit character varying(255) NOT NULL,
    check_in_time timestamp with time zone,
    check_out_time timestamp with time zone,
    status public."enum_Visits_status" DEFAULT 'active'::public."enum_Visits_status",
    notes text,
    companion_name character varying(255),
    companion_cedula character varying(255),
    vehicle_brand character varying(255),
    vehicle_model character varying(255),
    vehicle_plate character varying(255),
    area character varying(255),
    action public."enum_Visits_action" DEFAULT 'Ninguna'::public."enum_Visits_action",
    department character varying(255),
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    visitor_id integer,
    arrival_time timestamp with time zone,
    entry_time timestamp with time zone,
    exit_time timestamp with time zone,
    target_department text,
    host_person text
);


--
-- Name: Visits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Visits_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Visits_id_seq" OWNED BY public."Visits".id;


--
-- Name: ActivityLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLogs" ALTER COLUMN id SET DEFAULT nextval('public."ActivityLogs_id_seq"'::regclass);


--
-- Name: ArcoRequests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArcoRequests" ALTER COLUMN id SET DEFAULT nextval('public."ArcoRequests_id_seq"'::regclass);


--
-- Name: Departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Departments" ALTER COLUMN id SET DEFAULT nextval('public."Departments_id_seq"'::regclass);


--
-- Name: IntermittentLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntermittentLogs" ALTER COLUMN id SET DEFAULT nextval('public."IntermittentLogs_id_seq"'::regclass);


--
-- Name: Users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users" ALTER COLUMN id SET DEFAULT nextval('public."Users_id_seq"'::regclass);


--
-- Name: VisitPurposes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VisitPurposes" ALTER COLUMN id SET DEFAULT nextval('public."VisitPurposes_id_seq"'::regclass);


--
-- Name: VisitorEditHistories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VisitorEditHistories" ALTER COLUMN id SET DEFAULT nextval('public."VisitorEditHistories_id_seq"'::regclass);


--
-- Name: Visitors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Visitors" ALTER COLUMN id SET DEFAULT nextval('public."Visitors_id_seq"'::regclass);


--
-- Name: Visits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Visits" ALTER COLUMN id SET DEFAULT nextval('public."Visits_id_seq"'::regclass);


--
-- Name: ActivityLogs ActivityLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLogs"
    ADD CONSTRAINT "ActivityLogs_pkey" PRIMARY KEY (id);


--
-- Name: ArcoRequests ArcoRequests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ArcoRequests"
    ADD CONSTRAINT "ArcoRequests_pkey" PRIMARY KEY (id);


--
-- Name: Departments Departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Departments"
    ADD CONSTRAINT "Departments_pkey" PRIMARY KEY (id);


--
-- Name: IntermittentLogs IntermittentLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntermittentLogs"
    ADD CONSTRAINT "IntermittentLogs_pkey" PRIMARY KEY (id);


--
-- Name: SequelizeMeta SequelizeMeta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SequelizeMeta"
    ADD CONSTRAINT "SequelizeMeta_pkey" PRIMARY KEY (name);


--
-- Name: Users Users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY (id);


--
-- Name: Users Users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_username_key" UNIQUE (username);


--
-- Name: VisitPurposes VisitPurposes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VisitPurposes"
    ADD CONSTRAINT "VisitPurposes_pkey" PRIMARY KEY (id);


--
-- Name: VisitorEditHistories VisitorEditHistories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VisitorEditHistories"
    ADD CONSTRAINT "VisitorEditHistories_pkey" PRIMARY KEY (id);


--
-- Name: Visitors Visitors_cedula_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Visitors"
    ADD CONSTRAINT "Visitors_cedula_key" UNIQUE (cedula);


--
-- Name: Visitors Visitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Visitors"
    ADD CONSTRAINT "Visitors_pkey" PRIMARY KEY (id);


--
-- Name: Visits Visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Visits"
    ADD CONSTRAINT "Visits_pkey" PRIMARY KEY (id);


--
-- Name: idx_activity_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_action ON public."ActivityLogs" USING btree (action);


--
-- Name: idx_activity_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_created_at ON public."ActivityLogs" USING btree ("createdAt");


--
-- Name: idx_activity_logs_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_logs_username ON public."ActivityLogs" USING btree (username);


--
-- Name: idx_intermittent_logs_visit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_intermittent_logs_visit_id ON public."IntermittentLogs" USING btree (visit_id);


--
-- Name: idx_visitors_cedula_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_visitors_cedula_unique ON public."Visitors" USING btree (cedula);


--
-- Name: idx_visitors_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitors_company ON public."Visitors" USING btree (company);


--
-- Name: idx_visits_check_in_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_check_in_time ON public."Visits" USING btree (check_in_time);


--
-- Name: idx_visits_check_out_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_check_out_time ON public."Visits" USING btree (check_out_time);


--
-- Name: idx_visits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_status ON public."Visits" USING btree (status);


--
-- Name: idx_visits_visitor_cedula; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visits_visitor_cedula ON public."Visits" USING btree (visitor_cedula);


--
-- Name: visits_one_open_per_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX visits_one_open_per_visitor ON public."Visits" USING btree (visitor_cedula) WHERE ((status = ANY (ARRAY['waiting'::public."enum_Visits_status", 'active'::public."enum_Visits_status", 'intermittent'::public."enum_Visits_status"])) AND (check_out_time IS NULL));


--
-- Name: IntermittentLogs IntermittentLogs_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntermittentLogs"
    ADD CONSTRAINT "IntermittentLogs_visit_id_fkey" FOREIGN KEY (visit_id) REFERENCES public."Visits"(id) ON DELETE CASCADE;


--
-- Name: Visits Visits_visitor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Visits"
    ADD CONSTRAINT "Visits_visitor_id_fkey" FOREIGN KEY (visitor_id) REFERENCES public."Visitors"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--
