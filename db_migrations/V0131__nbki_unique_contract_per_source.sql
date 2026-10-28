ALTER TABLE nbki_deals
    ADD CONSTRAINT nbki_deals_org_contract_unique UNIQUE (org_id, contract_no);
