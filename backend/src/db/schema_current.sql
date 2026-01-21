WARNING:  invalid configuration parameter name "supautils.disable_program", removing it
DETAIL:  "supautils" is now a reserved prefix.
--
-- PostgreSQL database dump
--

\restrict tldWJgtSrMxIbIAMst1KtUfSOibz7b9obwiNlcqfr5AoUpSgEIymnerZhw1JUqh

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: ClientBusinessType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ClientBusinessType" AS ENUM (
    'OIL_AND_GAS',
    'LNG',
    'GEOTHERMAL',
    'CONSTRUCTION',
    'MANUFACTURING',
    'OTHER'
);


--
-- Name: RFQStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RFQStatus" AS ENUM (
    'NEW',
    'PARSED',
    'SPEC_MATCHED',
    'ORIGIN_COMPLETE',
    'PRICED',
    'APPROVED',
    'AGREEMENT_READY'
);


--
-- Name: RequestType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RequestType" AS ENUM (
    'TENDER',
    'PURCHASE_ORDER'
);


--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserRole" AS ENUM (
    'L1',
    'L2'
);


--
-- Name: calculate_price_change_pct(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_price_change_pct() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        IF NEW.previous_base_cost IS NOT NULL AND NEW.previous_base_cost > 0 THEN
          NEW.price_change_pct := ROUND(
            ((NEW.base_cost - NEW.previous_base_cost) / NEW.previous_base_cost * 100)::NUMERIC,
            2
          );
        ELSE
          NEW.price_change_pct := NULL;
        END IF;
        RETURN NEW;
      END;
      $$;


--
-- Name: get_previous_material_price(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_previous_material_price(material_uuid uuid, effective_dt date) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
      DECLARE
        prev_price NUMERIC(12, 2);
      BEGIN
        SELECT base_cost INTO prev_price
        FROM material_price_history
        WHERE material_id = material_uuid
          AND effective_date < effective_dt
        ORDER BY effective_date DESC
        LIMIT 1;
        
        -- If no history found, get current price from materials table
        IF prev_price IS NULL THEN
          SELECT base_cost INTO prev_price
          FROM materials
          WHERE id = material_uuid;
        END IF;
        
        RETURN prev_price;
      END;
      $$;


--
-- Name: normalize_regulatory_keyword(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_regulatory_keyword() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.keyword = LOWER(TRIM(NEW.keyword));
        RETURN NEW;
      END;
      $$;


--
-- Name: prevent_approval_events_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_approval_events_modification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'approval_events table is immutable. Updates are not allowed. Event ID: %', OLD.id;
      ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'approval_events table is immutable. Deletes are not allowed. Event ID: %', OLD.id;
      END IF;
      RETURN NULL;
    END;
    $$;


--
-- Name: update_assistant_documents_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_assistant_documents_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;


--
-- Name: update_document_extractions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_document_extractions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;


--
-- Name: update_kb_articles_search_vector(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_kb_articles_search_vector() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'B') ||
          setweight(to_tsvector('simple', COALESCE(NEW.subcategory, '')), 'B') ||
          setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C') ||
          setweight(to_tsvector('simple', COALESCE(NEW.summary, '')), 'C') ||
          setweight(to_tsvector('simple', COALESCE(NEW.content, '')), 'D');
        RETURN NEW;
      END;
      $$;


--
-- Name: update_kb_articles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_kb_articles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;


--
-- Name: update_mto_extractions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_mto_extractions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agreement_conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agreement_conditions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    agreement_id uuid NOT NULL,
    condition_type text NOT NULL,
    key_customer_id uuid,
    key_material_id uuid,
    key_material_group text,
    key_region text,
    key_incoterm text,
    rate_type text NOT NULL,
    rate_value numeric(18,6) NOT NULL,
    has_scale boolean DEFAULT false NOT NULL,
    condition_priority integer DEFAULT 100 NOT NULL,
    valid_from date,
    valid_to date,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agreement_conditions_condition_type_check CHECK ((condition_type = ANY (ARRAY['BASE_PRICE'::text, 'DISCOUNT'::text, 'SURCHARGE'::text, 'FREIGHT'::text, 'TAX'::text, 'LME_ADJUSTMENT'::text]))),
    CONSTRAINT agreement_conditions_rate_type_check CHECK ((rate_type = ANY (ARRAY['AMOUNT'::text, 'PERCENTAGE'::text]))),
    CONSTRAINT agreement_conditions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'blocked'::text])))
);

ALTER TABLE ONLY public.agreement_conditions FORCE ROW LEVEL SECURITY;


--
-- Name: agreement_headers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agreement_headers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid,
    agreement_code text NOT NULL,
    agreement_type text NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    valid_from date NOT NULL,
    valid_to date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    owner_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agreement_headers_agreement_type_check CHECK ((agreement_type = ANY (ARRAY['STANDARD'::text, 'CUSTOMER_SPECIFIC'::text, 'MATERIAL_GROUP'::text, 'PROMOTIONAL'::text]))),
    CONSTRAINT agreement_headers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'released'::text, 'expired'::text]))),
    CONSTRAINT agreement_headers_valid_dates CHECK ((valid_to >= valid_from))
);

ALTER TABLE ONLY public.agreement_headers FORCE ROW LEVEL SECURITY;


--
-- Name: agreement_scales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agreement_scales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    condition_id uuid NOT NULL,
    scale_from numeric(18,6) NOT NULL,
    scale_to numeric(18,6),
    scale_rate_type text NOT NULL,
    scale_rate_value numeric(18,6) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT agreement_scales_range CHECK (((scale_to IS NULL) OR (scale_to > scale_from))),
    CONSTRAINT agreement_scales_scale_rate_type_check CHECK ((scale_rate_type = ANY (ARRAY['AMOUNT'::text, 'PERCENTAGE'::text])))
);

ALTER TABLE ONLY public.agreement_scales FORCE ROW LEVEL SECURITY;


--
-- Name: ai_api_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_api_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service character varying(50) NOT NULL,
    operation character varying(100) NOT NULL,
    model character varying(100),
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    pages_analyzed integer,
    images_analyzed integer,
    api_latency_ms integer,
    estimated_cost_usd numeric(10,6),
    pricing_model_version character varying(50),
    pricing_run_id uuid,
    rfq_id uuid,
    tenant_id uuid NOT NULL,
    user_id character varying(255),
    correlation_id uuid,
    request_metadata jsonb,
    response_metadata jsonb,
    error_message text,
    success boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.ai_api_usage FORCE ROW LEVEL SECURITY;


--
-- Name: ai_cost_summary_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_cost_summary_daily AS
 SELECT date(created_at) AS date,
    tenant_id,
    service,
    count(*) AS api_calls,
    sum(total_tokens) AS total_tokens,
    sum(estimated_cost_usd) AS total_cost_usd,
    avg(api_latency_ms) AS avg_latency_ms,
    count(*) FILTER (WHERE (NOT success)) AS failed_calls
   FROM public.ai_api_usage
  GROUP BY (date(created_at)), tenant_id, service;


--
-- Name: ai_predictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_predictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pricing_run_id uuid,
    predicted_win_probability numeric(5,4) NOT NULL,
    confidence_score numeric(5,4) NOT NULL,
    risk_level character varying(20),
    current_margin_pct numeric(5,2),
    current_total_price numeric(12,2),
    current_expected_revenue numeric(12,2),
    recommended_margin_pct numeric(5,2),
    recommended_total_price numeric(12,2),
    recommended_win_probability numeric(5,4),
    recommended_expected_revenue numeric(12,2),
    optimization_gain_pct numeric(6,2),
    rationale jsonb,
    risk_analysis jsonb,
    similar_quotes jsonb,
    features jsonb,
    actual_outcome character varying(20),
    actual_final_price numeric(12,2),
    actual_margin_pct numeric(5,2),
    outcome_recorded_at timestamp with time zone,
    user_action character varying(50),
    user_applied_recommendation boolean DEFAULT false,
    user_feedback text,
    model_version character varying(50) DEFAULT 'gpt-4o-v1'::character varying,
    prediction_time_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT ai_predictions_actual_outcome_check CHECK (((actual_outcome)::text = ANY ((ARRAY['won'::character varying, 'lost'::character varying, 'pending'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT ai_predictions_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric))),
    CONSTRAINT ai_predictions_predicted_win_probability_check CHECK (((predicted_win_probability >= (0)::numeric) AND (predicted_win_probability <= (1)::numeric))),
    CONSTRAINT ai_predictions_recommended_win_probability_check CHECK (((recommended_win_probability >= (0)::numeric) AND (recommended_win_probability <= (1)::numeric))),
    CONSTRAINT ai_predictions_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying])::text[]))),
    CONSTRAINT ai_predictions_user_action_check CHECK (((user_action)::text = ANY ((ARRAY['accepted'::character varying, 'rejected'::character varying, 'modified'::character varying, 'ignored'::character varying])::text[])))
);

ALTER TABLE ONLY public.ai_predictions FORCE ROW LEVEL SECURITY;


--
-- Name: approval_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(50) NOT NULL,
    event_timestamp timestamp with time zone DEFAULT now() NOT NULL,
    pricing_run_id uuid NOT NULL,
    actor_id character varying(255),
    actor_name character varying(255),
    actor_email character varying(255),
    actor_role character varying(50),
    actor_ip_address inet,
    actor_user_agent text,
    previous_status character varying(50),
    previous_level integer,
    previous_approver character varying(255),
    new_status character varying(50),
    new_level integer,
    new_approver character varying(255),
    notes text,
    metadata jsonb,
    correlation_id uuid,
    tenant_id uuid,
    is_automated boolean DEFAULT false,
    requires_review boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.approval_events FORCE ROW LEVEL SECURITY;


--
-- Name: approval_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    pricing_run_id uuid NOT NULL,
    approver_name text,
    approver_email text,
    action text NOT NULL,
    comments text,
    previous_status text,
    new_status text,
    created_at timestamp with time zone DEFAULT now(),
    actor_name text,
    actor_email text,
    notes text
);

ALTER TABLE ONLY public.approval_history FORCE ROW LEVEL SECURITY;


--
-- Name: assistant_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assistant_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    rfq_id uuid,
    agreement_id uuid,
    source_type text NOT NULL,
    source_document_id uuid,
    title text,
    status text DEFAULT 'draft'::text NOT NULL,
    text_content text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT assistant_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.assistant_documents FORCE ROW LEVEL SECURITY;


--
-- Name: client_pricing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    origin_type text DEFAULT 'ANY'::text NOT NULL,
    category text DEFAULT 'ANY'::text NOT NULL,
    markup_pct numeric NOT NULL,
    logistics_pct numeric NOT NULL,
    risk_pct numeric NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);

ALTER TABLE ONLY public.client_pricing_rules FORCE ROW LEVEL SECURITY;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    industry text,
    email text,
    phone text,
    address text,
    credit_limit numeric,
    payment_terms text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    country text DEFAULT 'MY'::text,
    tax_id text,
    tax_exempt boolean DEFAULT false
);

ALTER TABLE ONLY public.clients FORCE ROW LEVEL SECURITY;


--
-- Name: document_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    uploaded_by_user_id text,
    file_name text NOT NULL,
    file_type text NOT NULL,
    file_size_bytes integer,
    extraction_method text DEFAULT 'azure_doc_intelligence'::text NOT NULL,
    extracted_data jsonb NOT NULL,
    confidence_score numeric(3,2),
    validation_issues jsonb DEFAULT '[]'::jsonb,
    needs_review boolean DEFAULT false,
    corrected_data jsonb,
    reviewed_by_user_id text,
    reviewed_at timestamp with time zone,
    review_notes text,
    related_rfq_id uuid,
    converted_to_rfq boolean DEFAULT false,
    converted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT document_extractions_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric))),
    CONSTRAINT document_extractions_extraction_method_check CHECK ((extraction_method = ANY (ARRAY['azure_doc_intelligence'::text, 'gpt4_enrichment'::text, 'manual'::text]))),
    CONSTRAINT document_extractions_file_type_check CHECK ((file_type = ANY (ARRAY['pdf'::text, 'docx'::text, 'image'::text, 'jpg'::text, 'png'::text])))
);

ALTER TABLE ONLY public.document_extractions FORCE ROW LEVEL SECURITY;


--
-- Name: duty_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duty_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hs_code_id uuid NOT NULL,
    origin_country text NOT NULL,
    destination_country text NOT NULL,
    duty_rate_pct numeric(8,4) DEFAULT 0,
    rule_source text DEFAULT 'DEMO'::text,
    valid_from date,
    valid_to date,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT duty_rules_duty_rate_pct_check CHECK (((duty_rate_pct >= (0)::numeric) AND (duty_rate_pct <= (100)::numeric))),
    CONSTRAINT duty_rules_rule_source_check CHECK ((rule_source = ANY (ARRAY['MITI'::text, 'MIDA'::text, 'FTA'::text, 'DEMO'::text, 'CUSTOM'::text])))
);


--
-- Name: flange_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flange_grades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    spec text NOT NULL,
    product_form text,
    grade text NOT NULL,
    material_family text DEFAULT 'CS'::text,
    min_yield_psi numeric,
    min_tensile_psi numeric,
    min_yield_mpa numeric,
    min_tensile_mpa numeric,
    temp_service text,
    equiv_group text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: flanges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flanges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    standard text NOT NULL,
    nps_inch numeric NOT NULL,
    dn_mm integer,
    rating_class integer NOT NULL,
    type text NOT NULL,
    facing text NOT NULL,
    bore_inch numeric,
    od_inch numeric,
    thickness_inch numeric,
    hub_diameter_inch numeric,
    hub_length_inch numeric,
    bolt_circle_inch numeric,
    bolt_hole_diameter_inch numeric,
    number_of_bolts integer,
    bolt_size_inch text,
    weight_kg numeric,
    flange_category text,
    b165_table text,
    b165_page integer,
    source_file text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hs_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hs_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hs_code text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    material_group text NOT NULL,
    origin_restrictions jsonb,
    notes text,
    source text DEFAULT 'DEMO'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hs_codes_category_check CHECK ((category = ANY (ARRAY['PIPE'::text, 'FLANGE'::text, 'FITTING'::text, 'FASTENER'::text, 'GRATING'::text, 'PLATE'::text, 'OTHER'::text]))),
    CONSTRAINT hs_codes_material_group_check CHECK ((material_group = ANY (ARRAY['CARBON_STEEL'::text, 'STAINLESS_STEEL'::text, 'ALLOY_STEEL'::text, 'DUPLEX_STEEL'::text, 'NICKEL_ALLOY'::text, 'COPPER_ALLOY'::text, 'ALUMINUM'::text, 'OTHER'::text]))),
    CONSTRAINT hs_codes_source_check CHECK ((source = ANY (ARRAY['DEMO'::text, 'NSC'::text, 'SYSTEM'::text])))
);


--
-- Name: knowledge_base_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_base_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    slug text NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    subcategory text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    summary text NOT NULL,
    content text NOT NULL,
    importance_weight numeric(5,2) DEFAULT 1.0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_latest boolean DEFAULT true NOT NULL,
    source_type text DEFAULT 'manual'::text NOT NULL,
    source_ref text,
    cutoff_date date,
    valid_from date,
    valid_until date,
    created_by text,
    updated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    search_vector tsvector
);

ALTER TABLE ONLY public.knowledge_base_articles FORCE ROW LEVEL SECURITY;


--
-- Name: lme_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lme_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    commodity text NOT NULL,
    price_usd_per_ton numeric(12,2) NOT NULL,
    effective_date date NOT NULL,
    quarter text,
    source text DEFAULT 'manual_entry'::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    notes text,
    CONSTRAINT lme_prices_commodity_check CHECK ((commodity = ANY (ARRAY['nickel'::text, 'copper'::text, 'moly'::text]))),
    CONSTRAINT lme_prices_source_check CHECK ((source = ANY (ARRAY['lme_api'::text, 'manual_entry'::text])))
);


--
-- Name: material_equivalences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_equivalences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    family text NOT NULL,
    astm_spec text,
    en_spec text,
    jis_spec text,
    gb_spec text,
    notes text,
    is_approved boolean DEFAULT false,
    source text DEFAULT 'DEMO'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT at_least_one_spec CHECK (((astm_spec IS NOT NULL) OR (en_spec IS NOT NULL) OR (jis_spec IS NOT NULL) OR (gb_spec IS NOT NULL))),
    CONSTRAINT material_equivalences_family_check CHECK ((family = ANY (ARRAY['PIPE'::text, 'FLANGE'::text, 'FITTING'::text, 'FASTENER'::text, 'GRATING'::text, 'PLATE'::text, 'OTHER'::text]))),
    CONSTRAINT material_equivalences_source_check CHECK ((source = ANY (ARRAY['DEMO'::text, 'NSC'::text, 'SYSTEM'::text])))
);


--
-- Name: material_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_price_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    base_cost numeric(12,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    effective_date date NOT NULL,
    source text NOT NULL,
    notes text,
    uploaded_by text,
    previous_base_cost numeric(12,2),
    price_change_pct numeric(6,2),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT material_price_history_base_cost_check CHECK ((base_cost >= (0)::numeric)),
    CONSTRAINT material_price_history_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'MYR'::text, 'IDR'::text, 'SGD'::text, 'EUR'::text, 'CNY'::text]))),
    CONSTRAINT material_price_history_source_check CHECK ((source = ANY (ARRAY['manufacturer_feed'::text, 'manual_update'::text, 'lme_adjustment'::text, 'placeholder_estimate'::text])))
);


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_code text NOT NULL,
    category text NOT NULL,
    spec_standard text,
    grade text,
    material_type text,
    origin_type text NOT NULL,
    size_description text,
    base_cost numeric NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sku_attributes jsonb,
    sku_generated boolean DEFAULT false,
    sku character varying(128),
    pipe_id uuid,
    pipe_grade_id uuid,
    flange_id uuid,
    flange_grade_id uuid,
    beam_type text,
    beam_depth_mm numeric,
    beam_weight_per_m_kg numeric,
    od_mm numeric,
    id_mm numeric,
    wall_thickness_mm numeric,
    plate_thickness_mm numeric,
    european_standard text,
    european_grade text,
    european_designation text,
    dimensional_attributes jsonb,
    lme_commodity text,
    lme_sensitivity numeric(5,4),
    tenant_id uuid NOT NULL,
    CONSTRAINT materials_lme_commodity_check CHECK (((lme_commodity IS NULL) OR (lme_commodity = ANY (ARRAY['nickel'::text, 'copper'::text, 'moly'::text])))),
    CONSTRAINT materials_lme_sensitivity_check CHECK (((lme_sensitivity IS NULL) OR ((lme_sensitivity >= (0)::numeric) AND (lme_sensitivity <= (1)::numeric))))
);


--
-- Name: mto_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mto_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_extraction_id uuid,
    rfq_id uuid,
    mto_structure jsonb NOT NULL,
    weight_verification jsonb,
    pricing_readiness jsonb,
    confidence_score numeric(3,2),
    extraction_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    linked_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    CONSTRAINT mto_extractions_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))
);

ALTER TABLE ONLY public.mto_extractions FORCE ROW LEVEL SECURITY;


--
-- Name: pricing_run_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_run_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    pricing_run_id uuid NOT NULL,
    rfq_item_id uuid NOT NULL,
    material_id uuid,
    quantity numeric NOT NULL,
    unit_cost numeric,
    total_cost numeric,
    markup_percentage numeric,
    unit_price numeric,
    total_price numeric,
    margin_percentage numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    subtotal numeric(12,2),
    tax_amount numeric(12,2),
    tax_rate numeric(5,4),
    tax_exempt boolean DEFAULT false,
    exemption_reason text,
    total_with_tax numeric(12,2),
    dual_pricing_data jsonb,
    origin_selection_data jsonb,
    freight_cost numeric(12,2),
    insurance_cost numeric(12,2),
    handling_cost numeric(12,2),
    local_charges numeric(12,2),
    item_landed_cost numeric(12,2),
    logistics_cost numeric(12,2) DEFAULT 0
);

ALTER TABLE ONLY public.pricing_run_items FORCE ROW LEVEL SECURITY;


--
-- Name: pricing_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    rfq_id uuid NOT NULL,
    run_number integer,
    version integer DEFAULT 1,
    parent_version_id uuid,
    pricing_strategy text,
    total_cost numeric,
    total_price numeric,
    margin_percentage numeric,
    approval_status text DEFAULT 'pending'::text,
    approved_by text,
    approved_at timestamp with time zone,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ai_risk_level text,
    ai_risk_score integer,
    ai_recommendation text,
    ai_risk_factors jsonb,
    ai_rationale text,
    ai_key_points text[],
    ai_warnings text[],
    ai_confidence numeric(3,2),
    ai_assessed_at timestamp with time zone,
    subtotal numeric(12,2),
    tax_amount numeric(12,2),
    tax_rate numeric(5,4),
    tax_country text,
    tax_type text,
    total_with_tax numeric(12,2),
    approval_level integer DEFAULT 0,
    sales_approved_by text,
    sales_approved_at timestamp with time zone,
    sales_submitted_at timestamp with time zone,
    procurement_approved_by text,
    procurement_approved_at timestamp with time zone,
    procurement_submitted_at timestamp with time zone,
    management_approved_by text,
    management_approved_at timestamp with time zone,
    management_submitted_at timestamp with time zone,
    sales_sla_deadline timestamp with time zone,
    procurement_sla_deadline timestamp with time zone,
    management_sla_deadline timestamp with time zone,
    sla_expired boolean DEFAULT false,
    escalated boolean DEFAULT false,
    escalated_at timestamp with time zone,
    escalated_to text,
    backup_approver_assigned boolean DEFAULT false,
    backup_approver_assigned_at timestamp with time zone,
    backup_approver_email text,
    approval_path jsonb,
    regulatory_advisory jsonb,
    outcome text,
    outcome_date timestamp with time zone,
    outcome_reason text,
    total_final_import_duty numeric(12,2) DEFAULT 0 NOT NULL,
    total_freight_cost numeric(12,2) DEFAULT 0,
    total_insurance_cost numeric(12,2) DEFAULT 0,
    total_handling_cost numeric(12,2) DEFAULT 0,
    total_local_charges numeric(12,2) DEFAULT 0,
    total_landed_cost numeric(12,2),
    version_number integer DEFAULT 1 NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    superseded_by uuid,
    superseded_reason text,
    rejection_reason text,
    CONSTRAINT check_ai_confidence CHECK (((ai_confidence IS NULL) OR ((ai_confidence >= (0)::numeric) AND (ai_confidence <= (1)::numeric)))),
    CONSTRAINT check_ai_recommendation CHECK (((ai_recommendation IS NULL) OR (ai_recommendation = ANY (ARRAY['AUTO_APPROVE'::text, 'MANUAL_REVIEW'::text])))),
    CONSTRAINT check_ai_risk_level CHECK (((ai_risk_level IS NULL) OR (ai_risk_level = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text])))),
    CONSTRAINT check_ai_risk_score CHECK (((ai_risk_score IS NULL) OR ((ai_risk_score >= 0) AND (ai_risk_score <= 100)))),
    CONSTRAINT pricing_runs_approval_level_check CHECK (((approval_level >= 0) AND (approval_level <= 4))),
    CONSTRAINT pricing_runs_outcome_check CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY['won'::text, 'lost'::text, 'pending'::text, 'cancelled'::text]))))
);

ALTER TABLE ONLY public.pricing_runs FORCE ROW LEVEL SECURITY;


--
-- Name: mv_analytics_pricing_margins; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_analytics_pricing_margins AS
 SELECT pr.tenant_id,
    date(pr.created_at) AS date,
    count(DISTINCT pr.id) AS pricing_run_count,
    count(DISTINCT pr.rfq_id) AS unique_rfq_count,
    count(DISTINCT pri.id) AS total_items_priced,
    COALESCE(sum(pr.total_cost), (0)::numeric) AS total_cost_all_runs,
    COALESCE(sum(pr.total_price), (0)::numeric) AS total_price_all_runs,
    COALESCE(sum((pr.total_price - pr.total_cost)), (0)::numeric) AS total_margin_all_runs,
    COALESCE(avg(pr.margin_percentage), (0)::numeric) AS avg_margin_percentage,
    COALESCE(sum(pri.total_cost), (0)::numeric) AS items_total_cost,
    COALESCE(sum(pri.total_price), (0)::numeric) AS items_total_price,
    COALESCE(sum(pri.quantity), (0)::numeric) AS items_total_quantity,
    count(DISTINCT
        CASE
            WHEN (pr.approval_status = 'approved'::text) THEN pr.id
            ELSE NULL::uuid
        END) AS approved_runs_count,
    count(DISTINCT
        CASE
            WHEN (pr.approval_status = 'pending'::text) THEN pr.id
            ELSE NULL::uuid
        END) AS pending_runs_count,
    count(DISTINCT
        CASE
            WHEN (pr.approval_status = 'rejected'::text) THEN pr.id
            ELSE NULL::uuid
        END) AS rejected_runs_count
   FROM (public.pricing_runs pr
     LEFT JOIN public.pricing_run_items pri ON ((pr.id = pri.pricing_run_id)))
  GROUP BY pr.tenant_id, (date(pr.created_at))
  ORDER BY pr.tenant_id, (date(pr.created_at)) DESC
  WITH NO DATA;


--
-- Name: rfq_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfq_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    rfq_id uuid NOT NULL,
    material_id uuid,
    material_code text,
    line_number integer,
    description text,
    quantity numeric NOT NULL,
    unit text,
    size text,
    grade text,
    spec text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    size_display text,
    size1_raw text,
    size2_raw text,
    hs_code text,
    import_duty_rate numeric(10,4),
    import_duty_amount numeric(10,2),
    hs_match_source text,
    hs_confidence numeric(3,2),
    origin_country character varying(10),
    trade_agreement character varying(50),
    final_import_duty_rate numeric(10,4),
    final_import_duty_amount numeric(12,2),
    material_treatment_type text DEFAULT 'CANONICAL'::text NOT NULL,
    item_parameters jsonb,
    CONSTRAINT rfq_items_hs_confidence_check CHECK (((hs_confidence IS NULL) OR ((hs_confidence >= (0)::numeric) AND (hs_confidence <= (1)::numeric)))),
    CONSTRAINT rfq_items_hs_match_source_check CHECK (((hs_match_source IS NULL) OR (hs_match_source = ANY (ARRAY['RULE'::text, 'MAPPING'::text, 'DIRECT_HS'::text, 'MANUAL'::text, 'NONE'::text])))),
    CONSTRAINT rfq_items_material_treatment_type_check CHECK ((material_treatment_type = ANY (ARRAY['CANONICAL'::text, 'PARAMETERIZED'::text, 'PROJECT_SPECIFIC'::text]))),
    CONSTRAINT rfq_items_trade_agreement_check CHECK (((trade_agreement IS NULL) OR ((trade_agreement)::text = ANY ((ARRAY['ASEAN'::character varying, 'RCEP'::character varying, 'AFTA'::character varying, 'MFN'::character varying, 'CUSTOM'::character varying])::text[]))))
);

ALTER TABLE ONLY public.rfq_items FORCE ROW LEVEL SECURITY;


--
-- Name: rfqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid,
    client_id uuid,
    rfq_number text,
    rfq_name text,
    status text DEFAULT 'draft'::text,
    due_date date,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    project_type text,
    rfq_code text,
    original_filename text,
    document_type text DEFAULT 'RFQ'::text NOT NULL,
    CONSTRAINT rfqs_document_type_check CHECK ((document_type = ANY (ARRAY['RFQ'::text, 'PO'::text, 'MTO'::text, 'BOQ'::text, 'Budget'::text, 'Tender'::text, 'Change Order'::text, 'Re-quote'::text]))),
    CONSTRAINT rfqs_project_type_check CHECK (((project_type IS NULL) OR (project_type = ANY (ARRAY['standard'::text, 'rush'::text, 'ltpa'::text, 'spot'::text]))))
);

ALTER TABLE ONLY public.rfqs FORCE ROW LEVEL SECURITY;


--
-- Name: v_analytics_rfq_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_analytics_rfq_daily AS
 SELECT date(r.created_at) AS date,
    r.tenant_id,
    count(DISTINCT r.id) AS rfq_count,
    count(DISTINCT ri.id) AS total_items,
    COALESCE(sum(ri.quantity), (0)::numeric) AS total_quantity,
    count(DISTINCT r.client_id) AS unique_clients,
    count(DISTINCT r.project_id) AS unique_projects
   FROM (public.rfqs r
     LEFT JOIN public.rfq_items ri ON ((r.id = ri.rfq_id)))
  GROUP BY (date(r.created_at)), r.tenant_id
  ORDER BY r.tenant_id, (date(r.created_at)) DESC;


--
-- Name: mv_analytics_rfq_daily; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_analytics_rfq_daily AS
 SELECT date,
    tenant_id,
    rfq_count,
    total_items,
    total_quantity,
    unique_clients,
    unique_projects
   FROM public.v_analytics_rfq_daily
  WITH NO DATA;


--
-- Name: pipe_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipe_grades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    spec text NOT NULL,
    product_form text,
    grade text NOT NULL,
    material_family text DEFAULT 'CS'::text,
    min_yield_psi numeric,
    min_tensile_psi numeric,
    min_yield_mpa numeric,
    min_tensile_mpa numeric,
    c_max numeric,
    mn_min numeric,
    mn_max numeric,
    p_max numeric,
    s_max numeric,
    si_min numeric,
    other_limits text,
    temp_service text,
    equiv_group text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: pipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    standard text NOT NULL,
    material_spec text,
    manufacturing_method text,
    nps_inch numeric NOT NULL,
    dn_mm integer,
    outside_diameter_in numeric,
    outside_diameter_mm numeric,
    schedule text,
    wall_thickness_in numeric,
    wall_thickness_mm numeric,
    weight_lb_per_ft numeric,
    weight_kg_per_m numeric,
    shipping_weight_m3 numeric,
    end_type text DEFAULT 'PE'::text,
    is_stainless boolean DEFAULT false,
    is_preferred boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    od_inch numeric,
    od_mm numeric,
    pipe_category text,
    pressure_series text,
    nps_display text,
    b3610_table text,
    b3610_page integer,
    source_file text,
    is_active boolean DEFAULT true
);


--
-- Name: price_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid,
    commodity text NOT NULL,
    previous_price numeric(12,2),
    adjusted_price numeric(12,2),
    lme_previous_price numeric(12,2) NOT NULL,
    lme_current_price numeric(12,2) NOT NULL,
    lme_movement_percent numeric(8,4) NOT NULL,
    price_adjustment_percent numeric(8,4) NOT NULL,
    quarter text,
    effective_date date NOT NULL,
    justification_report_id uuid,
    status text DEFAULT 'suggested'::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    applied_at timestamp with time zone,
    applied_by text,
    notes text,
    CONSTRAINT price_adjustments_status_check CHECK ((status = ANY (ARRAY['suggested'::text, 'applied'::text, 'rejected'::text])))
);


--
-- Name: price_agreement_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_agreement_document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    price_agreement_id uuid NOT NULL,
    tenant_id uuid,
    version integer NOT NULL,
    format text NOT NULL,
    html_snapshot text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: price_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    material_id uuid,
    category text,
    base_price numeric NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    volume_tiers jsonb,
    valid_from date NOT NULL,
    valid_until date NOT NULL,
    payment_terms text,
    delivery_terms text,
    notes text,
    status text DEFAULT 'draft'::text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    document_version integer DEFAULT 0
);

ALTER TABLE ONLY public.price_agreements FORCE ROW LEVEL SECURITY;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    project_type text,
    start_date date,
    end_date date,
    status text DEFAULT 'active'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.projects FORCE ROW LEVEL SECURITY;


--
-- Name: quote_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quote_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    pricing_run_id uuid NOT NULL,
    rfq_id uuid NOT NULL,
    client_id uuid,
    customer_name text,
    total_value numeric,
    approved_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    converted_price_agreement_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT quote_candidates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'converted'::text, 'dismissed'::text])))
);

ALTER TABLE ONLY public.quote_candidates FORCE ROW LEVEL SECURITY;


--
-- Name: regulatory_country_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulatory_country_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code character varying(3) NOT NULL,
    country_name character varying(255) NOT NULL,
    hs_code_system character varying(100) NOT NULL,
    default_trade_agreements jsonb DEFAULT '[]'::jsonb,
    duty_calculation_rules jsonb DEFAULT '{}'::jsonb,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT country_code_format CHECK (((country_code)::text ~ '^[A-Z]{2,3}$'::text)),
    CONSTRAINT default_trade_agreements_array CHECK ((jsonb_typeof(default_trade_agreements) = 'array'::text))
);


--
-- Name: regulatory_hs_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulatory_hs_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hs_code text NOT NULL,
    category text NOT NULL,
    sub_category text,
    description text NOT NULL,
    import_duty numeric(10,4) DEFAULT 0 NOT NULL,
    surtax numeric(10,4),
    excise numeric(10,4),
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT regulatory_hs_codes_excise_check CHECK (((excise IS NULL) OR (excise >= (0)::numeric))),
    CONSTRAINT regulatory_hs_codes_import_duty_check CHECK ((import_duty >= (0)::numeric)),
    CONSTRAINT regulatory_hs_codes_surtax_check CHECK (((surtax IS NULL) OR (surtax >= (0)::numeric)))
);


--
-- Name: regulatory_keyword_mappings_tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulatory_keyword_mappings_tenant (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    keyword text NOT NULL,
    keyword_normalized text NOT NULL,
    hs_code_id uuid NOT NULL,
    priority integer DEFAULT 10 NOT NULL,
    source text DEFAULT 'LEARNED'::text NOT NULL,
    confidence_score numeric(3,2),
    usage_count integer DEFAULT 0 NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT regulatory_keyword_mappings_tenant_confidence_score_check CHECK (((confidence_score IS NULL) OR ((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric)))),
    CONSTRAINT regulatory_keyword_mappings_tenant_source_check CHECK ((source = ANY (ARRAY['SYSTEM'::text, 'ADMIN'::text, 'LEARNED'::text])))
);

ALTER TABLE ONLY public.regulatory_keyword_mappings_tenant FORCE ROW LEVEL SECURITY;


--
-- Name: regulatory_learning_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulatory_learning_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    rfq_id uuid,
    rfq_item_id uuid,
    material_description text NOT NULL,
    material_description_normalized text,
    hs_code_suggested text,
    hs_code_final text,
    match_source text,
    confidence numeric(3,2),
    origin_country character varying(10),
    trade_agreement character varying(50),
    event_type text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT regulatory_learning_events_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT regulatory_learning_events_event_type_check CHECK ((event_type = ANY (ARRAY['LOW_CONFIDENCE'::text, 'OVERRIDDEN'::text, 'NO_MATCH'::text, 'MANUAL_CORRECTION'::text]))),
    CONSTRAINT regulatory_learning_events_match_source_check CHECK ((match_source = ANY (ARRAY['DIRECT_HS'::text, 'RULE'::text, 'MAPPING'::text, 'NONE'::text])))
);

ALTER TABLE ONLY public.regulatory_learning_events FORCE ROW LEVEL SECURITY;


--
-- Name: regulatory_material_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulatory_material_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keyword text NOT NULL,
    hs_code_id uuid NOT NULL,
    priority integer DEFAULT 10 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: regulatory_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulatory_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_name text NOT NULL,
    project_type text,
    operator text,
    material_family text,
    standard_spec text,
    constraint_type text NOT NULL,
    message text NOT NULL,
    is_active boolean DEFAULT false,
    source text DEFAULT 'DEMO'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT regulatory_rules_constraint_type_check CHECK ((constraint_type = ANY (ARRAY['BLOCK'::text, 'WARN'::text, 'EXTRA_DOCS'::text, 'ADVISORY'::text]))),
    CONSTRAINT regulatory_rules_material_family_check CHECK ((material_family = ANY (ARRAY['PIPE'::text, 'FLANGE'::text, 'FITTING'::text, 'FASTENER'::text, 'GRATING'::text, 'PLATE'::text, 'OTHER'::text]))),
    CONSTRAINT regulatory_rules_source_check CHECK ((source = ANY (ARRAY['DEMO'::text, 'NSC'::text, 'SYSTEM'::text])))
);


--
-- Name: supplier_performance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_performance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    metric_type text NOT NULL,
    metric_value numeric NOT NULL,
    period_start date,
    period_end date,
    recorded_at timestamp with time zone DEFAULT now(),
    context jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT supplier_performance_metric_type_check CHECK ((metric_type = ANY (ARRAY['on_time_delivery'::text, 'quality_score'::text, 'price_variance'::text, 'lead_time_variance'::text, 'defect_rate'::text, 'response_time'::text, 'order_fulfillment_rate'::text, 'custom'::text]))),
    CONSTRAINT supplier_performance_period_check CHECK (((period_end IS NULL) OR (period_start IS NULL) OR (period_end >= period_start)))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    country text,
    category text,
    supplier_type text,
    origin_type text,
    email text,
    phone text,
    address text,
    status text DEFAULT 'ACTIVE'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT suppliers_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'SUSPENDED'::text])))
);


--
-- Name: tariff_keyword_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tariff_keyword_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keyword text NOT NULL,
    schedule_code text DEFAULT 'PDK2025'::text NOT NULL,
    country text DEFAULT 'MY'::text NOT NULL,
    hs_chapters jsonb NOT NULL,
    example_hs_codes jsonb NOT NULL,
    source text NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tariff_keyword_groups_country_check CHECK ((length(country) = 2))
);


--
-- Name: tax_exemption_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_exemption_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country text NOT NULL,
    category_code text NOT NULL,
    category_name text NOT NULL,
    description text,
    requires_certificate boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: tax_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country text NOT NULL,
    tax_type text NOT NULL,
    tax_name text NOT NULL,
    tax_rate numeric(5,4) NOT NULL,
    is_active boolean DEFAULT true,
    effective_from date NOT NULL,
    effective_until date,
    applies_to_category text,
    exemption_codes text[],
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT tax_rules_country_check CHECK ((country = ANY (ARRAY['MY'::text, 'ID'::text, 'SG'::text]))),
    CONSTRAINT tax_rules_type_check CHECK ((tax_type = ANY (ARRAY['SST'::text, 'VAT'::text, 'GST'::text, 'WHT'::text])))
);


--
-- Name: tenant_onboarding_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_onboarding_status (
    tenant_id uuid NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    current_step text,
    completed_steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT tenant_onboarding_completed_steps_array CHECK ((jsonb_typeof(completed_steps) = 'array'::text)),
    CONSTRAINT tenant_onboarding_status_current_step_check CHECK ((current_step = ANY (ARRAY['profile'::text, 'approval_rules'::text, 'operator_rules'::text, 'pricing'::text, 'catalog'::text, 'notifications'::text, 'regulatory'::text, 'review'::text]))),
    CONSTRAINT tenant_onboarding_status_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])))
);

ALTER TABLE ONLY public.tenant_onboarding_status FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    home_country character varying(3),
    allowed_countries_of_import jsonb DEFAULT '[]'::jsonb,
    is_demo boolean DEFAULT false NOT NULL,
    CONSTRAINT tenants_allowed_countries_array CHECK ((jsonb_typeof(allowed_countries_of_import) = 'array'::text)),
    CONSTRAINT tenants_code_format CHECK ((code ~ '^[A-Za-z0-9_]+$'::text)),
    CONSTRAINT tenants_home_country_format CHECK (((home_country IS NULL) OR ((home_country)::text ~ '^[A-Z]{2,3}$'::text)))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    tenant_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_role CHECK ((role = ANY (ARRAY['sales_rep'::text, 'procurement'::text, 'manager'::text, 'admin'::text])))
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;


--
-- Name: v_materials_full; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_materials_full AS
 SELECT DISTINCT ON (m.id) m.id AS material_id,
    m.material_code,
    m.category,
    m.spec_standard,
    m.grade,
    m.material_type,
    m.origin_type,
    m.size_description,
    m.base_cost,
    m.currency,
    m.notes,
    m.created_at AS material_created_at,
    m.updated_at AS material_updated_at,
    rmm.id AS mapping_id,
    rmm.keyword AS mapping_keyword,
    rhs.id AS hs_code_id,
    rhs.hs_code,
    rhs.description AS hs_description,
    rhs.category AS hs_category,
    rhs.sub_category AS hs_sub_category,
    rhs.import_duty AS hs_import_duty,
    rhs.surtax AS hs_surtax,
    rhs.excise AS hs_excise
   FROM ((public.materials m
     LEFT JOIN public.regulatory_material_mapping rmm ON (((lower(m.material_code) = lower(rmm.keyword)) OR ((m.size_description IS NOT NULL) AND (lower(m.size_description) = lower(rmm.keyword))) OR (lower(m.category) = lower(rmm.keyword)))))
     LEFT JOIN public.regulatory_hs_codes rhs ON (((rmm.hs_code_id = rhs.id) AND ((rhs.is_active = true) OR (rhs.is_active IS NULL)))))
  ORDER BY m.id, rmm.priority;


--
-- Name: v_price_agreements_active; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_price_agreements_active AS
 SELECT ah.id AS agreement_id,
    ah.tenant_id,
    ah.customer_id,
    ah.agreement_code,
    ah.agreement_type,
    ah.currency,
    ah.valid_from,
    ah.valid_to,
    ah.status,
    ah.owner_user_id,
    ah.created_at AS agreement_created_at,
    ah.updated_at AS agreement_updated_at,
    ac.id AS condition_id,
    ac.condition_type,
    ac.key_customer_id,
    ac.key_material_id,
    ac.key_material_group,
    ac.key_region,
    ac.key_incoterm,
    ac.rate_type,
    ac.rate_value,
    ac.has_scale,
    ac.condition_priority,
    ac.valid_from AS condition_valid_from,
    ac.valid_to AS condition_valid_to,
    ac.status AS condition_status,
    c.name AS customer_name,
    c.code AS customer_code
   FROM ((public.agreement_headers ah
     LEFT JOIN public.agreement_conditions ac ON ((ah.id = ac.agreement_id)))
     LEFT JOIN public.clients c ON ((ah.customer_id = c.id)))
  WHERE ((ah.status = 'released'::text) AND ((ah.valid_from <= CURRENT_DATE) AND (ah.valid_to >= CURRENT_DATE)) AND ((ac.status IS NULL) OR (ac.status = 'active'::text)) AND ((ac.valid_from IS NULL) OR (ac.valid_from <= CURRENT_DATE)) AND ((ac.valid_to IS NULL) OR (ac.valid_to >= CURRENT_DATE)));


--
-- Name: v_pricing_runs_with_totals; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_pricing_runs_with_totals AS
 SELECT pr.id AS pricing_run_id,
    pr.tenant_id,
    pr.rfq_id,
    pr.run_number,
    pr.version,
    pr.parent_version_id,
    pr.pricing_strategy,
    pr.total_cost,
    pr.total_price,
    pr.margin_percentage,
    pr.approval_status,
    pr.approved_by,
    pr.approved_at,
    pr.notes,
    pr.created_by,
    pr.created_at,
    pr.updated_at,
    COALESCE(sum(pri.total_price), (0)::numeric) AS items_total_price,
    COALESCE(sum(pri.total_cost), (0)::numeric) AS items_total_cost,
    COALESCE(sum(pri.quantity), (0)::numeric) AS items_total_quantity,
    count(pri.id) AS items_count
   FROM (public.pricing_runs pr
     LEFT JOIN public.pricing_run_items pri ON ((pr.id = pri.pricing_run_id)))
  GROUP BY pr.id, pr.tenant_id, pr.rfq_id, pr.run_number, pr.version, pr.parent_version_id, pr.pricing_strategy, pr.total_cost, pr.total_price, pr.margin_percentage, pr.approval_status, pr.approved_by, pr.approved_at, pr.notes, pr.created_by, pr.created_at, pr.updated_at;


--
-- Name: v_rfq_with_items; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_rfq_with_items AS
 SELECT r.id AS rfq_id,
    r.tenant_id,
    r.project_id,
    r.client_id,
    r.rfq_number,
    r.rfq_name,
    r.status AS rfq_status,
    r.due_date,
    r.notes AS rfq_notes,
    r.created_by AS rfq_created_by,
    r.created_at AS rfq_created_at,
    r.updated_at AS rfq_updated_at,
    ri.id AS rfq_item_id,
    ri.material_id,
    ri.material_code,
    ri.line_number,
    ri.description AS item_description,
    ri.quantity,
    ri.unit,
    ri.size,
    ri.grade,
    ri.spec,
    ri.notes AS item_notes,
    ri.hs_code,
    ri.import_duty_rate,
    ri.created_at AS item_created_at,
    ri.updated_at AS item_updated_at
   FROM (public.rfqs r
     LEFT JOIN public.rfq_items ri ON ((r.id = ri.rfq_id)));


--
-- Name: v_tenant_users_basic; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_tenant_users_basic AS
 SELECT u.id AS user_id,
    u.tenant_id,
    u.email,
    u.name,
    u.role,
    u.is_active,
    u.last_login_at,
    u.created_at AS user_created_at,
    u.updated_at AS user_updated_at,
    t.id AS tenant_id_from_tenant,
    t.name AS tenant_name,
    t.code AS tenant_code,
    t.is_active AS tenant_is_active
   FROM (public.users u
     LEFT JOIN public.tenants t ON ((u.tenant_id = t.id)));


--
-- Name: agreement_conditions agreement_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_conditions
    ADD CONSTRAINT agreement_conditions_pkey PRIMARY KEY (id);


--
-- Name: agreement_headers agreement_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_headers
    ADD CONSTRAINT agreement_headers_pkey PRIMARY KEY (id);


--
-- Name: agreement_headers agreement_headers_tenant_id_agreement_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_headers
    ADD CONSTRAINT agreement_headers_tenant_id_agreement_code_key UNIQUE (tenant_id, agreement_code);


--
-- Name: agreement_scales agreement_scales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_scales
    ADD CONSTRAINT agreement_scales_pkey PRIMARY KEY (id);


--
-- Name: ai_api_usage ai_api_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_usage
    ADD CONSTRAINT ai_api_usage_pkey PRIMARY KEY (id);


--
-- Name: ai_predictions ai_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_predictions
    ADD CONSTRAINT ai_predictions_pkey PRIMARY KEY (id);


--
-- Name: approval_events approval_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_events
    ADD CONSTRAINT approval_events_pkey PRIMARY KEY (id);


--
-- Name: approval_history approval_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_history
    ADD CONSTRAINT approval_history_pkey PRIMARY KEY (id);


--
-- Name: assistant_documents assistant_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_documents
    ADD CONSTRAINT assistant_documents_pkey PRIMARY KEY (id);


--
-- Name: client_pricing_rules client_pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_pricing_rules
    ADD CONSTRAINT client_pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: document_extractions document_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_pkey PRIMARY KEY (id);


--
-- Name: duty_rules duty_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_rules
    ADD CONSTRAINT duty_rules_pkey PRIMARY KEY (id);


--
-- Name: flange_grades flange_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flange_grades
    ADD CONSTRAINT flange_grades_pkey PRIMARY KEY (id);


--
-- Name: flanges flanges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flanges
    ADD CONSTRAINT flanges_pkey PRIMARY KEY (id);


--
-- Name: hs_codes hs_codes_hs_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hs_codes
    ADD CONSTRAINT hs_codes_hs_code_key UNIQUE (hs_code);


--
-- Name: hs_codes hs_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hs_codes
    ADD CONSTRAINT hs_codes_pkey PRIMARY KEY (id);


--
-- Name: knowledge_base_articles knowledge_base_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_base_articles
    ADD CONSTRAINT knowledge_base_articles_pkey PRIMARY KEY (id);


--
-- Name: lme_prices lme_prices_commodity_effective_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_prices
    ADD CONSTRAINT lme_prices_commodity_effective_date_key UNIQUE (commodity, effective_date);


--
-- Name: lme_prices lme_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lme_prices
    ADD CONSTRAINT lme_prices_pkey PRIMARY KEY (id);


--
-- Name: material_equivalences material_equivalences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_equivalences
    ADD CONSTRAINT material_equivalences_pkey PRIMARY KEY (id);


--
-- Name: material_price_history material_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_price_history
    ADD CONSTRAINT material_price_history_pkey PRIMARY KEY (id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: materials materials_tenant_material_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_tenant_material_code_unique UNIQUE (tenant_id, material_code);


--
-- Name: mto_extractions mto_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mto_extractions
    ADD CONSTRAINT mto_extractions_pkey PRIMARY KEY (id);


--
-- Name: pipe_grades pipe_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipe_grades
    ADD CONSTRAINT pipe_grades_pkey PRIMARY KEY (id);


--
-- Name: pipes pipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipes
    ADD CONSTRAINT pipes_pkey PRIMARY KEY (id);


--
-- Name: price_adjustments price_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_adjustments
    ADD CONSTRAINT price_adjustments_pkey PRIMARY KEY (id);


--
-- Name: price_agreement_document_versions price_agreement_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_agreement_document_versions
    ADD CONSTRAINT price_agreement_document_versions_pkey PRIMARY KEY (id);


--
-- Name: price_agreements price_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_agreements
    ADD CONSTRAINT price_agreements_pkey PRIMARY KEY (id);


--
-- Name: pricing_run_items pricing_run_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_run_items
    ADD CONSTRAINT pricing_run_items_pkey PRIMARY KEY (id);


--
-- Name: pricing_runs pricing_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_runs
    ADD CONSTRAINT pricing_runs_pkey PRIMARY KEY (id);


--
-- Name: pricing_runs pricing_runs_tenant_id_rfq_id_run_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_runs
    ADD CONSTRAINT pricing_runs_tenant_id_rfq_id_run_number_key UNIQUE (tenant_id, rfq_id, run_number);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: quote_candidates quote_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_candidates
    ADD CONSTRAINT quote_candidates_pkey PRIMARY KEY (id);


--
-- Name: quote_candidates quote_candidates_pricing_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_candidates
    ADD CONSTRAINT quote_candidates_pricing_run_id_key UNIQUE (pricing_run_id);


--
-- Name: regulatory_country_profiles regulatory_country_profiles_country_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_country_profiles
    ADD CONSTRAINT regulatory_country_profiles_country_code_key UNIQUE (country_code);


--
-- Name: regulatory_country_profiles regulatory_country_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_country_profiles
    ADD CONSTRAINT regulatory_country_profiles_pkey PRIMARY KEY (id);


--
-- Name: regulatory_hs_codes regulatory_hs_codes_hs_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_hs_codes
    ADD CONSTRAINT regulatory_hs_codes_hs_code_key UNIQUE (hs_code);


--
-- Name: regulatory_hs_codes regulatory_hs_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_hs_codes
    ADD CONSTRAINT regulatory_hs_codes_pkey PRIMARY KEY (id);


--
-- Name: regulatory_keyword_mappings_tenant regulatory_keyword_mappings_tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_keyword_mappings_tenant
    ADD CONSTRAINT regulatory_keyword_mappings_tenant_pkey PRIMARY KEY (id);


--
-- Name: regulatory_keyword_mappings_tenant regulatory_keyword_mappings_tenant_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_keyword_mappings_tenant
    ADD CONSTRAINT regulatory_keyword_mappings_tenant_unique UNIQUE (tenant_id, keyword_normalized, hs_code_id);


--
-- Name: regulatory_learning_events regulatory_learning_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_learning_events
    ADD CONSTRAINT regulatory_learning_events_pkey PRIMARY KEY (id);


--
-- Name: regulatory_material_mapping regulatory_material_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_material_mapping
    ADD CONSTRAINT regulatory_material_mapping_pkey PRIMARY KEY (id);


--
-- Name: regulatory_rules regulatory_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_rules
    ADD CONSTRAINT regulatory_rules_pkey PRIMARY KEY (id);


--
-- Name: rfq_items rfq_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_items
    ADD CONSTRAINT rfq_items_pkey PRIMARY KEY (id);


--
-- Name: rfqs rfqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_pkey PRIMARY KEY (id);


--
-- Name: rfqs rfqs_tenant_id_rfq_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_tenant_id_rfq_number_key UNIQUE (tenant_id, rfq_number);


--
-- Name: supplier_performance supplier_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_performance
    ADD CONSTRAINT supplier_performance_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: tariff_keyword_groups tariff_keyword_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariff_keyword_groups
    ADD CONSTRAINT tariff_keyword_groups_pkey PRIMARY KEY (id);


--
-- Name: tax_exemption_categories tax_exemption_categories_country_category_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_exemption_categories
    ADD CONSTRAINT tax_exemption_categories_country_category_code_key UNIQUE (country, category_code);


--
-- Name: tax_exemption_categories tax_exemption_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_exemption_categories
    ADD CONSTRAINT tax_exemption_categories_pkey PRIMARY KEY (id);


--
-- Name: tax_rules tax_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_rules
    ADD CONSTRAINT tax_rules_pkey PRIMARY KEY (id);


--
-- Name: tenant_onboarding_status tenant_onboarding_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_onboarding_status
    ADD CONSTRAINT tenant_onboarding_status_pkey PRIMARY KEY (tenant_id);


--
-- Name: tenant_settings tenant_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_pkey PRIMARY KEY (id);


--
-- Name: tenant_settings tenant_settings_tenant_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_tenant_id_key_key UNIQUE (tenant_id, key);


--
-- Name: tenants tenants_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_code_key UNIQUE (code);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: flange_grades unique_flange_grade; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flange_grades
    ADD CONSTRAINT unique_flange_grade UNIQUE (spec, grade, product_form);


--
-- Name: tariff_keyword_groups unique_keyword_schedule_country; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tariff_keyword_groups
    ADD CONSTRAINT unique_keyword_schedule_country UNIQUE (keyword, schedule_code, country);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_tenant_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_email_key UNIQUE (tenant_id, email);


--
-- Name: idx_agreement_conditions_agreement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_conditions_agreement ON public.agreement_conditions USING btree (agreement_id, condition_priority);


--
-- Name: idx_agreement_conditions_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_conditions_lookup ON public.agreement_conditions USING btree (tenant_id, key_customer_id, key_material_id, key_material_group, key_region, condition_type, status);


--
-- Name: idx_agreement_conditions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_conditions_tenant ON public.agreement_conditions USING btree (tenant_id);


--
-- Name: idx_agreement_conditions_validity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_conditions_validity ON public.agreement_conditions USING btree (valid_from, valid_to);


--
-- Name: idx_agreement_headers_tenant_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_headers_tenant_customer ON public.agreement_headers USING btree (tenant_id, customer_id);


--
-- Name: idx_agreement_headers_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_headers_tenant_status ON public.agreement_headers USING btree (tenant_id, status);


--
-- Name: idx_agreement_headers_validity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_headers_validity ON public.agreement_headers USING btree (valid_from, valid_to);


--
-- Name: idx_agreement_scales_condition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_scales_condition ON public.agreement_scales USING btree (condition_id, scale_from);


--
-- Name: idx_agreement_scales_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agreement_scales_tenant ON public.agreement_scales USING btree (tenant_id);


--
-- Name: idx_ai_api_usage_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_api_usage_tenant_id ON public.ai_api_usage USING btree (tenant_id);


--
-- Name: idx_ai_predictions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_predictions_created ON public.ai_predictions USING btree (created_at DESC);


--
-- Name: idx_ai_predictions_outcome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_predictions_outcome ON public.ai_predictions USING btree (actual_outcome, created_at DESC) WHERE (actual_outcome IS NOT NULL);


--
-- Name: idx_ai_predictions_pricing_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_predictions_pricing_run ON public.ai_predictions USING btree (pricing_run_id);


--
-- Name: idx_ai_predictions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_predictions_tenant_id ON public.ai_predictions USING btree (tenant_id);


--
-- Name: idx_ai_usage_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_correlation ON public.ai_api_usage USING btree (correlation_id);


--
-- Name: idx_ai_usage_cost_analysis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_cost_analysis ON public.ai_api_usage USING btree (tenant_id, service, created_at DESC) INCLUDE (estimated_cost_usd, total_tokens);


--
-- Name: idx_ai_usage_pricing_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_pricing_run ON public.ai_api_usage USING btree (pricing_run_id);


--
-- Name: idx_ai_usage_service_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_service_created ON public.ai_api_usage USING btree (service, created_at DESC);


--
-- Name: idx_ai_usage_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_tenant_created ON public.ai_api_usage USING btree (tenant_id, created_at DESC);


--
-- Name: idx_approval_events_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_events_actor ON public.approval_events USING btree (actor_email, event_timestamp DESC);


--
-- Name: idx_approval_events_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_events_correlation ON public.approval_events USING btree (correlation_id);


--
-- Name: idx_approval_events_pricing_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_events_pricing_run ON public.approval_events USING btree (pricing_run_id, event_timestamp DESC);


--
-- Name: idx_approval_events_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_events_tenant ON public.approval_events USING btree (tenant_id, event_timestamp DESC);


--
-- Name: idx_approval_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_events_type ON public.approval_events USING btree (event_type, event_timestamp DESC);


--
-- Name: idx_approval_history_actor_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_history_actor_email ON public.approval_history USING btree (actor_email);


--
-- Name: idx_approval_history_actor_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_history_actor_name ON public.approval_history USING btree (actor_name);


--
-- Name: idx_approval_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_history_created_at ON public.approval_history USING btree (created_at DESC);


--
-- Name: idx_approval_history_pricing_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_history_pricing_run_id ON public.approval_history USING btree (pricing_run_id);


--
-- Name: idx_approval_history_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_history_tenant_id ON public.approval_history USING btree (tenant_id);


--
-- Name: idx_assistant_documents_metadata_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_documents_metadata_gin ON public.assistant_documents USING gin (metadata);


--
-- Name: idx_assistant_documents_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_documents_rfq ON public.assistant_documents USING btree (rfq_id);


--
-- Name: idx_assistant_documents_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_assistant_documents_source ON public.assistant_documents USING btree (tenant_id, source_type, source_document_id) WHERE (source_document_id IS NOT NULL);


--
-- Name: idx_assistant_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_documents_status ON public.assistant_documents USING btree (tenant_id, status);


--
-- Name: idx_assistant_documents_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assistant_documents_tenant ON public.assistant_documents USING btree (tenant_id);


--
-- Name: idx_client_pricing_rules_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_pricing_rules_tenant_id ON public.client_pricing_rules USING btree (tenant_id);


--
-- Name: idx_clients_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_code ON public.clients USING btree (tenant_id, code);


--
-- Name: idx_clients_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_name ON public.clients USING btree (tenant_id, name);


--
-- Name: idx_clients_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_tenant_id ON public.clients USING btree (tenant_id);


--
-- Name: idx_document_extractions_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_extractions_confidence ON public.document_extractions USING btree (confidence_score DESC);


--
-- Name: idx_document_extractions_needs_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_extractions_needs_review ON public.document_extractions USING btree (needs_review, created_at DESC) WHERE (needs_review = true);


--
-- Name: idx_document_extractions_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_extractions_rfq ON public.document_extractions USING btree (related_rfq_id) WHERE (related_rfq_id IS NOT NULL);


--
-- Name: idx_document_extractions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_extractions_tenant_id ON public.document_extractions USING btree (tenant_id);


--
-- Name: idx_document_extractions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_extractions_user ON public.document_extractions USING btree (uploaded_by_user_id, created_at DESC);


--
-- Name: idx_duty_rules_hs_code_origin_dest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_duty_rules_hs_code_origin_dest ON public.duty_rules USING btree (hs_code_id, origin_country, destination_country);


--
-- Name: idx_duty_rules_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_duty_rules_source ON public.duty_rules USING btree (rule_source);


--
-- Name: idx_duty_rules_validity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_duty_rules_validity ON public.duty_rules USING btree (valid_from, valid_to) WHERE ((valid_from IS NOT NULL) OR (valid_to IS NOT NULL));


--
-- Name: idx_flange_grades_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flange_grades_grade ON public.flange_grades USING btree (grade);


--
-- Name: idx_flange_grades_material_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flange_grades_material_family ON public.flange_grades USING btree (material_family);


--
-- Name: idx_flange_grades_spec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flange_grades_spec ON public.flange_grades USING btree (spec);


--
-- Name: idx_flanges_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flanges_is_active ON public.flanges USING btree (is_active);


--
-- Name: idx_flanges_nps_rating_type_facing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flanges_nps_rating_type_facing ON public.flanges USING btree (nps_inch, rating_class, type, facing);


--
-- Name: idx_flanges_rating_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flanges_rating_class ON public.flanges USING btree (rating_class);


--
-- Name: idx_flanges_standard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flanges_standard ON public.flanges USING btree (standard);


--
-- Name: idx_flanges_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flanges_type ON public.flanges USING btree (type);


--
-- Name: idx_hs_codes_category_material_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hs_codes_category_material_group ON public.hs_codes USING btree (category, material_group);


--
-- Name: idx_hs_codes_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hs_codes_source ON public.hs_codes USING btree (source);


--
-- Name: idx_kb_articles_is_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_articles_is_latest ON public.knowledge_base_articles USING btree (tenant_id, is_latest) WHERE (is_latest = true);


--
-- Name: idx_kb_articles_search_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_articles_search_vector ON public.knowledge_base_articles USING gin (search_vector);


--
-- Name: idx_kb_articles_slug_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_kb_articles_slug_tenant ON public.knowledge_base_articles USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);


--
-- Name: idx_kb_articles_tenant_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kb_articles_tenant_category ON public.knowledge_base_articles USING btree (tenant_id, category, subcategory);


--
-- Name: idx_lme_prices_commodity_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lme_prices_commodity_date ON public.lme_prices USING btree (commodity, effective_date DESC);


--
-- Name: idx_lme_prices_quarter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lme_prices_quarter ON public.lme_prices USING btree (quarter) WHERE (quarter IS NOT NULL);


--
-- Name: idx_material_equivalences_family_astm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_equivalences_family_astm ON public.material_equivalences USING btree (family, astm_spec) WHERE (astm_spec IS NOT NULL);


--
-- Name: idx_material_equivalences_family_en; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_equivalences_family_en ON public.material_equivalences USING btree (family, en_spec) WHERE (en_spec IS NOT NULL);


--
-- Name: idx_material_equivalences_family_gb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_equivalences_family_gb ON public.material_equivalences USING btree (family, gb_spec) WHERE (gb_spec IS NOT NULL);


--
-- Name: idx_material_equivalences_family_jis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_equivalences_family_jis ON public.material_equivalences USING btree (family, jis_spec) WHERE (jis_spec IS NOT NULL);


--
-- Name: idx_material_equivalences_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_equivalences_source ON public.material_equivalences USING btree (source, is_approved);


--
-- Name: idx_material_price_history_effective_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_price_history_effective_date ON public.material_price_history USING btree (effective_date DESC);


--
-- Name: idx_material_price_history_material_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_price_history_material_effective ON public.material_price_history USING btree (material_id, effective_date DESC);


--
-- Name: idx_material_price_history_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_price_history_material_id ON public.material_price_history USING btree (material_id);


--
-- Name: idx_material_price_history_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_material_price_history_source ON public.material_price_history USING btree (source);


--
-- Name: idx_materials_beam_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_beam_type ON public.materials USING btree (beam_type) WHERE (beam_type IS NOT NULL);


--
-- Name: idx_materials_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_category ON public.materials USING btree (category);


--
-- Name: idx_materials_dimensional_attributes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_dimensional_attributes ON public.materials USING gin (dimensional_attributes) WHERE (dimensional_attributes IS NOT NULL);


--
-- Name: idx_materials_european_standard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_european_standard ON public.materials USING btree (european_standard) WHERE (european_standard IS NOT NULL);


--
-- Name: idx_materials_flange_grade_combo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_flange_grade_combo ON public.materials USING btree (flange_id, flange_grade_id) WHERE ((flange_id IS NOT NULL) AND (flange_grade_id IS NOT NULL));


--
-- Name: idx_materials_flange_grade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_flange_grade_id ON public.materials USING btree (flange_grade_id);


--
-- Name: idx_materials_flange_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_flange_id ON public.materials USING btree (flange_id);


--
-- Name: idx_materials_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_grade ON public.materials USING btree (grade);


--
-- Name: idx_materials_lme_commodity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_lme_commodity ON public.materials USING btree (lme_commodity) WHERE (lme_commodity IS NOT NULL);


--
-- Name: idx_materials_material_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_material_code ON public.materials USING btree (material_code);


--
-- Name: idx_materials_od_mm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_od_mm ON public.materials USING btree (od_mm) WHERE (od_mm IS NOT NULL);


--
-- Name: idx_materials_origin_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_origin_category ON public.materials USING btree (origin_type, category);


--
-- Name: idx_materials_origin_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_origin_type ON public.materials USING btree (origin_type);


--
-- Name: idx_materials_pipe_grade_combo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_pipe_grade_combo ON public.materials USING btree (pipe_id, pipe_grade_id) WHERE ((pipe_id IS NOT NULL) AND (pipe_grade_id IS NOT NULL));


--
-- Name: idx_materials_pipe_grade_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_pipe_grade_id ON public.materials USING btree (pipe_grade_id);


--
-- Name: idx_materials_pipe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_pipe_id ON public.materials USING btree (pipe_id);


--
-- Name: idx_materials_plate_thickness; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_plate_thickness ON public.materials USING btree (plate_thickness_mm) WHERE (plate_thickness_mm IS NOT NULL);


--
-- Name: idx_materials_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_sku ON public.materials USING btree (sku);


--
-- Name: idx_materials_sku_attributes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_sku_attributes ON public.materials USING gin (sku_attributes);


--
-- Name: idx_materials_tenant_material_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_tenant_material_code ON public.materials USING btree (tenant_id, material_code);


--
-- Name: idx_mto_extractions_confidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mto_extractions_confidence ON public.mto_extractions USING btree (confidence_score DESC);


--
-- Name: idx_mto_extractions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mto_extractions_created ON public.mto_extractions USING btree (created_at DESC);


--
-- Name: idx_mto_extractions_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mto_extractions_document ON public.mto_extractions USING btree (document_extraction_id);


--
-- Name: idx_mto_extractions_rfq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mto_extractions_rfq ON public.mto_extractions USING btree (rfq_id) WHERE (rfq_id IS NOT NULL);


--
-- Name: idx_mto_extractions_structure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mto_extractions_structure ON public.mto_extractions USING gin (mto_structure);


--
-- Name: idx_mto_extractions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mto_extractions_tenant_id ON public.mto_extractions USING btree (tenant_id);


--
-- Name: idx_mv_analytics_pricing_margins_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_analytics_pricing_margins_date ON public.mv_analytics_pricing_margins USING btree (date DESC);


--
-- Name: idx_mv_analytics_pricing_margins_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_analytics_pricing_margins_tenant_date ON public.mv_analytics_pricing_margins USING btree (tenant_id, date DESC);


--
-- Name: idx_mv_analytics_rfq_daily_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_analytics_rfq_daily_date ON public.mv_analytics_rfq_daily USING btree (date DESC);


--
-- Name: idx_mv_analytics_rfq_daily_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mv_analytics_rfq_daily_tenant_date ON public.mv_analytics_rfq_daily USING btree (tenant_id, date DESC);


--
-- Name: idx_pipe_grades_material_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipe_grades_material_family ON public.pipe_grades USING btree (material_family);


--
-- Name: idx_pipe_grades_spec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipe_grades_spec ON public.pipe_grades USING btree (spec);


--
-- Name: idx_pipe_grades_spec_grade_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pipe_grades_spec_grade_unique ON public.pipe_grades USING btree (spec, grade);


--
-- Name: idx_pipes_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipes_is_active ON public.pipes USING btree (is_active);


--
-- Name: idx_pipes_material_spec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipes_material_spec ON public.pipes USING btree (material_spec);


--
-- Name: idx_pipes_nps_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipes_nps_schedule ON public.pipes USING btree (nps_inch, schedule);


--
-- Name: idx_pipes_od_inch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipes_od_inch ON public.pipes USING btree (od_inch);


--
-- Name: idx_pipes_preferred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipes_preferred ON public.pipes USING btree (is_preferred, nps_inch);


--
-- Name: idx_pipes_standard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipes_standard ON public.pipes USING btree (standard);


--
-- Name: idx_pipes_unique_spec; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pipes_unique_spec ON public.pipes USING btree (standard, nps_inch, schedule, wall_thickness_in) WHERE ((standard IS NOT NULL) AND (nps_inch IS NOT NULL) AND (schedule IS NOT NULL) AND (wall_thickness_in IS NOT NULL));


--
-- Name: idx_price_adjustments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_adjustments_status ON public.price_adjustments USING btree (status, quarter, effective_date DESC);


--
-- Name: idx_price_agreement_document_versions_agreement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_agreement_document_versions_agreement ON public.price_agreement_document_versions USING btree (price_agreement_id, version DESC);


--
-- Name: idx_price_agreements_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_agreements_client_id ON public.price_agreements USING btree (client_id);


--
-- Name: idx_price_agreements_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_agreements_material_id ON public.price_agreements USING btree (material_id);


--
-- Name: idx_price_agreements_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_agreements_status ON public.price_agreements USING btree (tenant_id, status);


--
-- Name: idx_price_agreements_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_agreements_tenant_id ON public.price_agreements USING btree (tenant_id);


--
-- Name: idx_price_agreements_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_agreements_tenant_status ON public.price_agreements USING btree (tenant_id, status);


--
-- Name: idx_price_agreements_valid_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_agreements_valid_dates ON public.price_agreements USING btree (valid_from, valid_until);


--
-- Name: idx_pricing_rules_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_rules_category ON public.client_pricing_rules USING btree (category);


--
-- Name: idx_pricing_rules_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_rules_client_id ON public.client_pricing_rules USING btree (client_id);


--
-- Name: idx_pricing_rules_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_rules_composite ON public.client_pricing_rules USING btree (client_id, origin_type, category);


--
-- Name: idx_pricing_rules_origin_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_rules_origin_type ON public.client_pricing_rules USING btree (origin_type);


--
-- Name: idx_pricing_run_items_dual_pricing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_run_items_dual_pricing ON public.pricing_run_items USING gin (dual_pricing_data) WHERE (dual_pricing_data IS NOT NULL);


--
-- Name: idx_pricing_run_items_freight_cost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_run_items_freight_cost ON public.pricing_run_items USING btree (freight_cost) WHERE (freight_cost IS NOT NULL);


--
-- Name: idx_pricing_run_items_material; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_run_items_material ON public.pricing_run_items USING btree (pricing_run_id, rfq_item_id);


--
-- Name: idx_pricing_run_items_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_run_items_material_id ON public.pricing_run_items USING btree (material_id);


--
-- Name: idx_pricing_run_items_origin_selection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_run_items_origin_selection ON public.pricing_run_items USING gin (origin_selection_data) WHERE (origin_selection_data IS NOT NULL);


--
-- Name: idx_pricing_run_items_pricing_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_run_items_pricing_run_id ON public.pricing_run_items USING btree (pricing_run_id);


--
-- Name: idx_pricing_run_items_rfq_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_run_items_rfq_item_id ON public.pricing_run_items USING btree (rfq_item_id);


--
-- Name: idx_pricing_run_items_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_run_items_tenant_id ON public.pricing_run_items USING btree (tenant_id);


--
-- Name: idx_pricing_runs_ai_recommendation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_ai_recommendation ON public.pricing_runs USING btree (ai_recommendation, ai_assessed_at DESC) WHERE (ai_recommendation IS NOT NULL);


--
-- Name: idx_pricing_runs_ai_risk_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_ai_risk_level ON public.pricing_runs USING btree (ai_risk_level, ai_risk_score) WHERE (ai_risk_level IS NOT NULL);


--
-- Name: idx_pricing_runs_approval_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_approval_level ON public.pricing_runs USING btree (approval_level) WHERE (approval_status = 'pending_approval'::text);


--
-- Name: idx_pricing_runs_approval_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_approval_status ON public.pricing_runs USING btree (tenant_id, approval_status);


--
-- Name: idx_pricing_runs_approval_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_approval_status_created ON public.pricing_runs USING btree (approval_status, created_at DESC);


--
-- Name: idx_pricing_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_created_at ON public.pricing_runs USING btree (tenant_id, created_at DESC);


--
-- Name: idx_pricing_runs_escalated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_escalated ON public.pricing_runs USING btree (escalated) WHERE (escalated = true);


--
-- Name: idx_pricing_runs_parent_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_parent_version ON public.pricing_runs USING btree (parent_version_id);


--
-- Name: idx_pricing_runs_rfq_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_rfq_id ON public.pricing_runs USING btree (rfq_id);


--
-- Name: idx_pricing_runs_rfq_is_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_rfq_is_current ON public.pricing_runs USING btree (rfq_id, is_current) WHERE (is_current = true);


--
-- Name: idx_pricing_runs_sla_deadlines; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_sla_deadlines ON public.pricing_runs USING btree (sales_sla_deadline, procurement_sla_deadline, management_sla_deadline) WHERE (approval_status = 'pending_approval'::text);


--
-- Name: idx_pricing_runs_tax_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_tax_country ON public.pricing_runs USING btree (tax_country);


--
-- Name: idx_pricing_runs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_tenant_id ON public.pricing_runs USING btree (tenant_id);


--
-- Name: idx_pricing_runs_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_tenant_status ON public.pricing_runs USING btree (tenant_id, approval_status);


--
-- Name: idx_pricing_runs_total_landed_cost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_total_landed_cost ON public.pricing_runs USING btree (total_landed_cost) WHERE (total_landed_cost IS NOT NULL);


--
-- Name: idx_pricing_runs_version_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_runs_version_number ON public.pricing_runs USING btree (rfq_id, version_number DESC);


--
-- Name: idx_projects_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_client_id ON public.projects USING btree (client_id);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_status ON public.projects USING btree (tenant_id, status);


--
-- Name: idx_projects_tenant_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_tenant_client ON public.projects USING btree (tenant_id, client_id);


--
-- Name: idx_projects_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_tenant_id ON public.projects USING btree (tenant_id);


--
-- Name: idx_quote_candidates_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_candidates_created_at ON public.quote_candidates USING btree (tenant_id, created_at DESC);


--
-- Name: idx_quote_candidates_pricing_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_candidates_pricing_run_id ON public.quote_candidates USING btree (pricing_run_id);


--
-- Name: idx_quote_candidates_rfq_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_candidates_rfq_id ON public.quote_candidates USING btree (rfq_id);


--
-- Name: idx_quote_candidates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_candidates_status ON public.quote_candidates USING btree (tenant_id, status) WHERE (status = 'pending'::text);


--
-- Name: idx_quote_candidates_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_candidates_tenant_id ON public.quote_candidates USING btree (tenant_id);


--
-- Name: idx_regulatory_country_profiles_country_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_country_profiles_country_code ON public.regulatory_country_profiles USING btree (country_code);


--
-- Name: idx_regulatory_country_profiles_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_country_profiles_is_active ON public.regulatory_country_profiles USING btree (is_active);


--
-- Name: idx_regulatory_hs_codes_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_hs_codes_category ON public.regulatory_hs_codes USING btree (category);


--
-- Name: idx_regulatory_hs_codes_hs_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_hs_codes_hs_code ON public.regulatory_hs_codes USING btree (hs_code);


--
-- Name: idx_regulatory_hs_codes_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_hs_codes_is_active ON public.regulatory_hs_codes USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_regulatory_keyword_mappings_tenant_hs_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_keyword_mappings_tenant_hs_code ON public.regulatory_keyword_mappings_tenant USING btree (hs_code_id);


--
-- Name: idx_regulatory_keyword_mappings_tenant_keyword; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_keyword_mappings_tenant_keyword ON public.regulatory_keyword_mappings_tenant USING btree (keyword_normalized);


--
-- Name: idx_regulatory_keyword_mappings_tenant_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_keyword_mappings_tenant_priority ON public.regulatory_keyword_mappings_tenant USING btree (tenant_id, priority);


--
-- Name: idx_regulatory_keyword_mappings_tenant_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_keyword_mappings_tenant_source ON public.regulatory_keyword_mappings_tenant USING btree (source);


--
-- Name: idx_regulatory_keyword_mappings_tenant_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_keyword_mappings_tenant_tenant_id ON public.regulatory_keyword_mappings_tenant USING btree (tenant_id);


--
-- Name: idx_regulatory_learning_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_learning_events_created_at ON public.regulatory_learning_events USING btree (created_at DESC);


--
-- Name: idx_regulatory_learning_events_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_learning_events_event_type ON public.regulatory_learning_events USING btree (event_type);


--
-- Name: idx_regulatory_learning_events_hs_code_final; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_learning_events_hs_code_final ON public.regulatory_learning_events USING btree (hs_code_final) WHERE (hs_code_final IS NOT NULL);


--
-- Name: idx_regulatory_learning_events_tenant_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_learning_events_tenant_event ON public.regulatory_learning_events USING btree (tenant_id, event_type, created_at DESC);


--
-- Name: idx_regulatory_learning_events_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_learning_events_tenant_id ON public.regulatory_learning_events USING btree (tenant_id) WHERE (tenant_id IS NOT NULL);


--
-- Name: idx_regulatory_material_mapping_hs_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_material_mapping_hs_code_id ON public.regulatory_material_mapping USING btree (hs_code_id);


--
-- Name: idx_regulatory_material_mapping_keyword; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_material_mapping_keyword ON public.regulatory_material_mapping USING btree (lower(keyword));


--
-- Name: idx_regulatory_material_mapping_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_material_mapping_priority ON public.regulatory_material_mapping USING btree (priority);


--
-- Name: idx_regulatory_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_rules_active ON public.regulatory_rules USING btree (is_active, constraint_type) WHERE (is_active = true);


--
-- Name: idx_regulatory_rules_material_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_rules_material_family ON public.regulatory_rules USING btree (material_family) WHERE (material_family IS NOT NULL);


--
-- Name: idx_regulatory_rules_project_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regulatory_rules_project_operator ON public.regulatory_rules USING btree (project_type, operator) WHERE ((project_type IS NOT NULL) OR (operator IS NOT NULL));


--
-- Name: idx_rfq_items_hs_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_items_hs_code ON public.rfq_items USING btree (hs_code) WHERE (hs_code IS NOT NULL);


--
-- Name: idx_rfq_items_material_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_items_material_code ON public.rfq_items USING btree (material_code);


--
-- Name: idx_rfq_items_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_items_material_id ON public.rfq_items USING btree (material_id);


--
-- Name: idx_rfq_items_origin_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_items_origin_country ON public.rfq_items USING btree (origin_country) WHERE (origin_country IS NOT NULL);


--
-- Name: idx_rfq_items_parameters; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_items_parameters ON public.rfq_items USING gin (item_parameters);


--
-- Name: idx_rfq_items_rfq_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_items_rfq_id ON public.rfq_items USING btree (rfq_id);


--
-- Name: idx_rfq_items_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_items_tenant_id ON public.rfq_items USING btree (tenant_id);


--
-- Name: idx_rfq_items_treatment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfq_items_treatment ON public.rfq_items USING btree (tenant_id, material_treatment_type);


--
-- Name: idx_rfqs_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_client_id ON public.rfqs USING btree (client_id);


--
-- Name: idx_rfqs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_created_at ON public.rfqs USING btree (tenant_id, created_at DESC);


--
-- Name: idx_rfqs_document_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_document_type ON public.rfqs USING btree (tenant_id, document_type);


--
-- Name: idx_rfqs_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_project_id ON public.rfqs USING btree (project_id);


--
-- Name: idx_rfqs_project_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_project_type ON public.rfqs USING btree (project_type) WHERE (project_type IS NOT NULL);


--
-- Name: idx_rfqs_rfq_code_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_rfq_code_lookup ON public.rfqs USING btree (rfq_code) WHERE (rfq_code IS NOT NULL);


--
-- Name: idx_rfqs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_status ON public.rfqs USING btree (tenant_id, status);


--
-- Name: idx_rfqs_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_status_created ON public.rfqs USING btree (status, created_at DESC);


--
-- Name: idx_rfqs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_tenant_id ON public.rfqs USING btree (tenant_id);


--
-- Name: idx_rfqs_tenant_rfq_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_rfqs_tenant_rfq_code_unique ON public.rfqs USING btree (tenant_id, rfq_code) WHERE (rfq_code IS NOT NULL);


--
-- Name: idx_rfqs_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfqs_tenant_status ON public.rfqs USING btree (tenant_id, status);


--
-- Name: idx_supplier_performance_metric_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_performance_metric_type ON public.supplier_performance USING btree (tenant_id, metric_type);


--
-- Name: idx_supplier_performance_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_performance_period ON public.supplier_performance USING btree (tenant_id, period_start, period_end);


--
-- Name: idx_supplier_performance_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_performance_recorded_at ON public.supplier_performance USING btree (tenant_id, recorded_at DESC);


--
-- Name: idx_supplier_performance_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_performance_supplier_id ON public.supplier_performance USING btree (supplier_id);


--
-- Name: idx_supplier_performance_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_performance_tenant_id ON public.supplier_performance USING btree (tenant_id);


--
-- Name: idx_suppliers_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_code ON public.suppliers USING btree (tenant_id, code) WHERE (code IS NOT NULL);


--
-- Name: idx_suppliers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_status ON public.suppliers USING btree (tenant_id, status);


--
-- Name: idx_suppliers_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_tenant_id ON public.suppliers USING btree (tenant_id);


--
-- Name: idx_tariff_keyword_groups_keyword; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tariff_keyword_groups_keyword ON public.tariff_keyword_groups USING btree (keyword) WHERE (is_active = true);


--
-- Name: idx_tariff_keyword_groups_keyword_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tariff_keyword_groups_keyword_active ON public.tariff_keyword_groups USING btree (keyword, is_active);


--
-- Name: idx_tariff_keyword_groups_schedule_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tariff_keyword_groups_schedule_country ON public.tariff_keyword_groups USING btree (schedule_code, country) WHERE (is_active = true);


--
-- Name: idx_tax_rules_country_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_rules_country_active ON public.tax_rules USING btree (country, is_active) WHERE (is_active = true);


--
-- Name: idx_tenant_onboarding_status_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_onboarding_status_status ON public.tenant_onboarding_status USING btree (status);


--
-- Name: idx_tenant_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_settings_key ON public.tenant_settings USING btree (tenant_id, key);


--
-- Name: idx_tenant_settings_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_settings_tenant_id ON public.tenant_settings USING btree (tenant_id);


--
-- Name: idx_tenants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_active ON public.tenants USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_tenants_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_code ON public.tenants USING btree (code);


--
-- Name: idx_tenants_home_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_home_country ON public.tenants USING btree (home_country);


--
-- Name: idx_tenants_is_demo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_is_demo ON public.tenants USING btree (is_demo) WHERE (is_demo = true);


--
-- Name: idx_users_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_active ON public.users USING btree (tenant_id, is_active) WHERE (is_active = true);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_tenant_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant_email ON public.users USING btree (tenant_id, email);


--
-- Name: idx_users_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant_id ON public.users USING btree (tenant_id);


--
-- Name: approval_events approval_events_immutable_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approval_events_immutable_trigger BEFORE DELETE OR UPDATE ON public.approval_events FOR EACH ROW EXECUTE FUNCTION public.prevent_approval_events_modification();


--
-- Name: agreement_conditions trg_agreement_conditions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agreement_conditions_updated_at BEFORE UPDATE ON public.agreement_conditions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agreement_headers trg_agreement_headers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agreement_headers_updated_at BEFORE UPDATE ON public.agreement_headers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agreement_scales trg_agreement_scales_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_agreement_scales_updated_at BEFORE UPDATE ON public.agreement_scales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: regulatory_material_mapping trg_normalize_regulatory_keyword; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_normalize_regulatory_keyword BEFORE INSERT OR UPDATE ON public.regulatory_material_mapping FOR EACH ROW EXECUTE FUNCTION public.normalize_regulatory_keyword();


--
-- Name: regulatory_country_profiles trg_regulatory_country_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_regulatory_country_profiles_updated_at BEFORE UPDATE ON public.regulatory_country_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: regulatory_hs_codes trg_regulatory_hs_codes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_regulatory_hs_codes_updated_at BEFORE UPDATE ON public.regulatory_hs_codes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: regulatory_keyword_mappings_tenant trg_regulatory_keyword_mappings_tenant_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_regulatory_keyword_mappings_tenant_updated_at BEFORE UPDATE ON public.regulatory_keyword_mappings_tenant FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: regulatory_material_mapping trg_regulatory_material_mapping_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_regulatory_material_mapping_updated_at BEFORE UPDATE ON public.regulatory_material_mapping FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenant_onboarding_status trg_tenant_onboarding_status_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_onboarding_status_updated_at BEFORE UPDATE ON public.tenant_onboarding_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: material_price_history trigger_calculate_price_change_pct; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_calculate_price_change_pct BEFORE INSERT OR UPDATE ON public.material_price_history FOR EACH ROW EXECUTE FUNCTION public.calculate_price_change_pct();


--
-- Name: assistant_documents trigger_update_assistant_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_assistant_documents_updated_at BEFORE UPDATE ON public.assistant_documents FOR EACH ROW EXECUTE FUNCTION public.update_assistant_documents_updated_at();


--
-- Name: document_extractions trigger_update_document_extractions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_document_extractions_updated_at BEFORE UPDATE ON public.document_extractions FOR EACH ROW EXECUTE FUNCTION public.update_document_extractions_updated_at();


--
-- Name: knowledge_base_articles trigger_update_kb_articles_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_kb_articles_search_vector BEFORE INSERT OR UPDATE ON public.knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION public.update_kb_articles_search_vector();


--
-- Name: knowledge_base_articles trigger_update_kb_articles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_kb_articles_updated_at BEFORE UPDATE ON public.knowledge_base_articles FOR EACH ROW EXECUTE FUNCTION public.update_kb_articles_updated_at();


--
-- Name: mto_extractions trigger_update_mto_extractions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_mto_extractions_updated_at BEFORE UPDATE ON public.mto_extractions FOR EACH ROW EXECUTE FUNCTION public.update_mto_extractions_updated_at();


--
-- Name: ai_predictions update_ai_predictions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_predictions_updated_at BEFORE UPDATE ON public.ai_predictions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: duty_rules update_duty_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_duty_rules_updated_at BEFORE UPDATE ON public.duty_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: hs_codes update_hs_codes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_hs_codes_updated_at BEFORE UPDATE ON public.hs_codes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: material_equivalences update_material_equivalences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_material_equivalences_updated_at BEFORE UPDATE ON public.material_equivalences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: materials update_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pipe_grades update_pipe_grades_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pipe_grades_updated_at BEFORE UPDATE ON public.pipe_grades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pipes update_pipes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pipes_updated_at BEFORE UPDATE ON public.pipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: price_agreements update_price_agreements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_price_agreements_updated_at BEFORE UPDATE ON public.price_agreements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pricing_run_items update_pricing_run_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pricing_run_items_updated_at BEFORE UPDATE ON public.pricing_run_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pricing_runs update_pricing_runs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pricing_runs_updated_at BEFORE UPDATE ON public.pricing_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: quote_candidates update_quote_candidates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_quote_candidates_updated_at BEFORE UPDATE ON public.quote_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: regulatory_rules update_regulatory_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_regulatory_rules_updated_at BEFORE UPDATE ON public.regulatory_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rfq_items update_rfq_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rfq_items_updated_at BEFORE UPDATE ON public.rfq_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rfqs update_rfqs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rfqs_updated_at BEFORE UPDATE ON public.rfqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: supplier_performance update_supplier_performance_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_supplier_performance_updated_at BEFORE UPDATE ON public.supplier_performance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers update_suppliers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tariff_keyword_groups update_tariff_keyword_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tariff_keyword_groups_updated_at BEFORE UPDATE ON public.tariff_keyword_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenant_settings update_tenant_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenant_settings_updated_at BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: agreement_conditions agreement_conditions_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_conditions
    ADD CONSTRAINT agreement_conditions_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.agreement_headers(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agreement_conditions agreement_conditions_key_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_conditions
    ADD CONSTRAINT agreement_conditions_key_customer_id_fkey FOREIGN KEY (key_customer_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agreement_conditions agreement_conditions_key_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_conditions
    ADD CONSTRAINT agreement_conditions_key_material_id_fkey FOREIGN KEY (key_material_id) REFERENCES public.materials(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agreement_conditions agreement_conditions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_conditions
    ADD CONSTRAINT agreement_conditions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agreement_headers agreement_headers_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_headers
    ADD CONSTRAINT agreement_headers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agreement_headers agreement_headers_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_headers
    ADD CONSTRAINT agreement_headers_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agreement_headers agreement_headers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_headers
    ADD CONSTRAINT agreement_headers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agreement_scales agreement_scales_condition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_scales
    ADD CONSTRAINT agreement_scales_condition_id_fkey FOREIGN KEY (condition_id) REFERENCES public.agreement_conditions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agreement_scales agreement_scales_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agreement_scales
    ADD CONSTRAINT agreement_scales_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ai_api_usage ai_api_usage_pricing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_usage
    ADD CONSTRAINT ai_api_usage_pricing_run_id_fkey FOREIGN KEY (pricing_run_id) REFERENCES public.pricing_runs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_api_usage ai_api_usage_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_usage
    ADD CONSTRAINT ai_api_usage_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_api_usage ai_api_usage_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_api_usage
    ADD CONSTRAINT ai_api_usage_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ai_predictions ai_predictions_pricing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_predictions
    ADD CONSTRAINT ai_predictions_pricing_run_id_fkey FOREIGN KEY (pricing_run_id) REFERENCES public.pricing_runs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ai_predictions ai_predictions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_predictions
    ADD CONSTRAINT ai_predictions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: approval_events approval_events_pricing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_events
    ADD CONSTRAINT approval_events_pricing_run_id_fkey FOREIGN KEY (pricing_run_id) REFERENCES public.pricing_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_history approval_history_pricing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_history
    ADD CONSTRAINT approval_history_pricing_run_id_fkey FOREIGN KEY (pricing_run_id) REFERENCES public.pricing_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: assistant_documents assistant_documents_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_documents
    ADD CONSTRAINT assistant_documents_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES public.price_agreements(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: assistant_documents assistant_documents_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_documents
    ADD CONSTRAINT assistant_documents_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: assistant_documents assistant_documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assistant_documents
    ADD CONSTRAINT assistant_documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_extractions document_extractions_related_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_related_rfq_id_fkey FOREIGN KEY (related_rfq_id) REFERENCES public.rfqs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_extractions document_extractions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_extractions
    ADD CONSTRAINT document_extractions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: duty_rules duty_rules_hs_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duty_rules
    ADD CONSTRAINT duty_rules_hs_code_id_fkey FOREIGN KEY (hs_code_id) REFERENCES public.hs_codes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: client_pricing_rules fk_client_pricing_rules_tenant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_pricing_rules
    ADD CONSTRAINT fk_client_pricing_rules_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: material_price_history material_price_history_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_price_history
    ADD CONSTRAINT material_price_history_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: materials materials_flange_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_flange_grade_id_fkey FOREIGN KEY (flange_grade_id) REFERENCES public.flange_grades(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: materials materials_flange_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_flange_id_fkey FOREIGN KEY (flange_id) REFERENCES public.flanges(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: materials materials_pipe_grade_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pipe_grade_id_fkey FOREIGN KEY (pipe_grade_id) REFERENCES public.pipe_grades(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: materials materials_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: mto_extractions mto_extractions_document_extraction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mto_extractions
    ADD CONSTRAINT mto_extractions_document_extraction_id_fkey FOREIGN KEY (document_extraction_id) REFERENCES public.document_extractions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: mto_extractions mto_extractions_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mto_extractions
    ADD CONSTRAINT mto_extractions_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: mto_extractions mto_extractions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mto_extractions
    ADD CONSTRAINT mto_extractions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: price_adjustments price_adjustments_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_adjustments
    ADD CONSTRAINT price_adjustments_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: price_agreement_document_versions price_agreement_document_versions_price_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_agreement_document_versions
    ADD CONSTRAINT price_agreement_document_versions_price_agreement_id_fkey FOREIGN KEY (price_agreement_id) REFERENCES public.price_agreements(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: price_agreements price_agreements_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_agreements
    ADD CONSTRAINT price_agreements_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: price_agreements price_agreements_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_agreements
    ADD CONSTRAINT price_agreements_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pricing_run_items pricing_run_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_run_items
    ADD CONSTRAINT pricing_run_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pricing_run_items pricing_run_items_pricing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_run_items
    ADD CONSTRAINT pricing_run_items_pricing_run_id_fkey FOREIGN KEY (pricing_run_id) REFERENCES public.pricing_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pricing_run_items pricing_run_items_rfq_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_run_items
    ADD CONSTRAINT pricing_run_items_rfq_item_id_fkey FOREIGN KEY (rfq_item_id) REFERENCES public.rfq_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pricing_runs pricing_runs_parent_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_runs
    ADD CONSTRAINT pricing_runs_parent_version_id_fkey FOREIGN KEY (parent_version_id) REFERENCES public.pricing_runs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pricing_runs pricing_runs_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_runs
    ADD CONSTRAINT pricing_runs_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pricing_runs pricing_runs_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_runs
    ADD CONSTRAINT pricing_runs_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.pricing_runs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: projects projects_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quote_candidates quote_candidates_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_candidates
    ADD CONSTRAINT quote_candidates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: quote_candidates quote_candidates_converted_price_agreement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_candidates
    ADD CONSTRAINT quote_candidates_converted_price_agreement_id_fkey FOREIGN KEY (converted_price_agreement_id) REFERENCES public.price_agreements(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: quote_candidates quote_candidates_pricing_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_candidates
    ADD CONSTRAINT quote_candidates_pricing_run_id_fkey FOREIGN KEY (pricing_run_id) REFERENCES public.pricing_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quote_candidates quote_candidates_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_candidates
    ADD CONSTRAINT quote_candidates_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: quote_candidates quote_candidates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quote_candidates
    ADD CONSTRAINT quote_candidates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: regulatory_keyword_mappings_tenant regulatory_keyword_mappings_tenant_hs_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_keyword_mappings_tenant
    ADD CONSTRAINT regulatory_keyword_mappings_tenant_hs_code_id_fkey FOREIGN KEY (hs_code_id) REFERENCES public.regulatory_hs_codes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: regulatory_material_mapping regulatory_material_mapping_hs_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_material_mapping
    ADD CONSTRAINT regulatory_material_mapping_hs_code_id_fkey FOREIGN KEY (hs_code_id) REFERENCES public.regulatory_hs_codes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rfq_items rfq_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_items
    ADD CONSTRAINT rfq_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: rfq_items rfq_items_rfq_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_items
    ADD CONSTRAINT rfq_items_rfq_id_fkey FOREIGN KEY (rfq_id) REFERENCES public.rfqs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rfqs rfqs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: rfqs rfqs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfqs
    ADD CONSTRAINT rfqs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supplier_performance supplier_performance_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_performance
    ADD CONSTRAINT supplier_performance_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_performance supplier_performance_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_performance
    ADD CONSTRAINT supplier_performance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_onboarding_status tenant_onboarding_status_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_onboarding_status
    ADD CONSTRAINT tenant_onboarding_status_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tenant_settings tenant_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_settings
    ADD CONSTRAINT tenant_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: agreement_conditions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agreement_conditions ENABLE ROW LEVEL SECURITY;

--
-- Name: agreement_conditions agreement_conditions_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agreement_conditions_tenant_isolation ON public.agreement_conditions USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_headers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agreement_headers ENABLE ROW LEVEL SECURITY;

--
-- Name: agreement_headers agreement_headers_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agreement_headers_tenant_isolation ON public.agreement_headers USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_scales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agreement_scales ENABLE ROW LEVEL SECURITY;

--
-- Name: agreement_scales agreement_scales_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agreement_scales_tenant_isolation ON public.agreement_scales USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_api_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_api_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_api_usage ai_api_usage_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_api_usage_tenant_isolation ON public.ai_api_usage USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_predictions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_predictions ai_predictions_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_predictions_tenant_isolation ON public.ai_predictions USING ((tenant_id = (current_setting('app.current_tenant_id'::text))::uuid));


--
-- Name: approval_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_events approval_events_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_events_tenant_isolation ON public.approval_events USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_history ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_history approval_history_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY approval_history_tenant_isolation ON public.approval_history USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: assistant_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assistant_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: assistant_documents assistant_documents_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assistant_documents_tenant_isolation ON public.assistant_documents USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: client_pricing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_pricing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: client_pricing_rules client_pricing_rules_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_pricing_rules_tenant_isolation ON public.client_pricing_rules USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_tenant_isolation ON public.clients USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: document_extractions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

--
-- Name: document_extractions document_extractions_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_extractions_tenant_isolation ON public.document_extractions USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: knowledge_base_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: knowledge_base_articles knowledge_base_articles_global_and_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY knowledge_base_articles_global_and_tenant_isolation ON public.knowledge_base_articles USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: mto_extractions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mto_extractions ENABLE ROW LEVEL SECURITY;

--
-- Name: mto_extractions mto_extractions_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mto_extractions_tenant_isolation ON public.mto_extractions USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: price_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: price_agreements price_agreements_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY price_agreements_tenant_isolation ON public.price_agreements USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_run_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_run_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_run_items pricing_run_items_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_run_items_tenant_isolation ON public.pricing_run_items USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_runs pricing_runs_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pricing_runs_tenant_isolation ON public.pricing_runs USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_tenant_isolation ON public.projects USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: quote_candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quote_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: quote_candidates quote_candidates_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quote_candidates_tenant_isolation ON public.quote_candidates USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_keyword_mappings_tenant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regulatory_keyword_mappings_tenant ENABLE ROW LEVEL SECURITY;

--
-- Name: regulatory_keyword_mappings_tenant regulatory_keyword_mappings_tenant_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY regulatory_keyword_mappings_tenant_tenant_isolation ON public.regulatory_keyword_mappings_tenant USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_learning_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regulatory_learning_events ENABLE ROW LEVEL SECURITY;

--
-- Name: regulatory_learning_events regulatory_learning_events_global_and_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY regulatory_learning_events_global_and_tenant_isolation ON public.regulatory_learning_events USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: rfq_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfq_items ENABLE ROW LEVEL SECURITY;

--
-- Name: rfq_items rfq_items_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfq_items_tenant_isolation ON public.rfq_items USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: rfqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;

--
-- Name: rfqs rfqs_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rfqs_tenant_isolation ON public.rfqs USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_conditions tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.agreement_conditions FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_headers tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.agreement_headers FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_scales tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.agreement_scales FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_api_usage tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.ai_api_usage FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_predictions tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.ai_predictions FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_events tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.approval_events FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_history tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.approval_history FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: assistant_documents tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.assistant_documents FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: clients tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.clients FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: document_extractions tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.document_extractions FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: knowledge_base_articles tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.knowledge_base_articles FOR DELETE USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: mto_extractions tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.mto_extractions FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: price_agreements tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.price_agreements FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_run_items tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.pricing_run_items FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_runs tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.pricing_runs FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: projects tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.projects FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_keyword_mappings_tenant tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.regulatory_keyword_mappings_tenant FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_learning_events tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.regulatory_learning_events FOR DELETE USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: rfq_items tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.rfq_items FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: rfqs tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.rfqs FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: tenant_onboarding_status tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.tenant_onboarding_status FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: users tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.users FOR DELETE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_conditions tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.agreement_conditions FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_headers tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.agreement_headers FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_scales tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.agreement_scales FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_api_usage tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.ai_api_usage FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_predictions tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.ai_predictions FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_events tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.approval_events FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_history tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.approval_history FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: assistant_documents tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.assistant_documents FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: clients tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.clients FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: document_extractions tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.document_extractions FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: knowledge_base_articles tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.knowledge_base_articles FOR INSERT WITH CHECK (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: mto_extractions tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.mto_extractions FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: price_agreements tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.price_agreements FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_run_items tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.pricing_run_items FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_runs tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.pricing_runs FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: projects tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.projects FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_keyword_mappings_tenant tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.regulatory_keyword_mappings_tenant FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_learning_events tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.regulatory_learning_events FOR INSERT WITH CHECK (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: rfq_items tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.rfq_items FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: rfqs tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.rfqs FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: tenant_onboarding_status tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.tenant_onboarding_status FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: users tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.users FOR INSERT WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_conditions tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.agreement_conditions FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_headers tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.agreement_headers FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_scales tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.agreement_scales FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_api_usage tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.ai_api_usage FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_predictions tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.ai_predictions FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_events tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.approval_events FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_history tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.approval_history FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: assistant_documents tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.assistant_documents FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: clients tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.clients FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: document_extractions tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.document_extractions FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: knowledge_base_articles tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.knowledge_base_articles FOR SELECT USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: mto_extractions tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.mto_extractions FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: price_agreements tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.price_agreements FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_run_items tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.pricing_run_items FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_runs tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.pricing_runs FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: projects tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.projects FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_keyword_mappings_tenant tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.regulatory_keyword_mappings_tenant FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_learning_events tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.regulatory_learning_events FOR SELECT USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: rfq_items tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.rfq_items FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: rfqs tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.rfqs FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: tenant_onboarding_status tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.tenant_onboarding_status FOR SELECT USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_conditions tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.agreement_conditions FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_headers tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.agreement_headers FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: agreement_scales tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.agreement_scales FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_api_usage tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.ai_api_usage FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: ai_predictions tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.ai_predictions FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_events tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.approval_events FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: approval_history tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.approval_history FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: assistant_documents tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.assistant_documents FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: clients tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.clients FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: document_extractions tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.document_extractions FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: knowledge_base_articles tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.knowledge_base_articles FOR UPDATE USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid))) WITH CHECK (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: mto_extractions tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.mto_extractions FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: price_agreements tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.price_agreements FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_run_items tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.pricing_run_items FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: pricing_runs tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.pricing_runs FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: projects tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.projects FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_keyword_mappings_tenant tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.regulatory_keyword_mappings_tenant FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: regulatory_learning_events tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.regulatory_learning_events FOR UPDATE USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid))) WITH CHECK (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)));


--
-- Name: rfq_items tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.rfq_items FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: rfqs tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.rfqs FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: tenant_onboarding_status tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.tenant_onboarding_status FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: users tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.users FOR UPDATE USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: tenant_onboarding_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_onboarding_status ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_onboarding_status tenant_onboarding_status_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_onboarding_status_tenant_isolation ON public.tenant_onboarding_status USING ((tenant_id = (current_setting('app.tenant_id'::text, true))::uuid));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_auth_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_auth_select ON public.users FOR SELECT USING ((((current_setting('app.tenant_id'::text, true) IS NOT NULL) AND (tenant_id = (current_setting('app.tenant_id'::text, true))::uuid)) OR (current_setting('app.tenant_id'::text, true) IS NULL)));


--
-- PostgreSQL database dump complete
--

\unrestrict tldWJgtSrMxIbIAMst1KtUfSOibz7b9obwiNlcqfr5AoUpSgEIymnerZhw1JUqh

