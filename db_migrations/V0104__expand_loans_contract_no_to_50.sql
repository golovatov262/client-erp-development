-- Расширяем номер договора займа: было VARCHAR(30), не хватало длины при вводе длинных номеров
ALTER TABLE t_p25513958_client_erp_developme.loans
    ALTER COLUMN contract_no TYPE VARCHAR(50);