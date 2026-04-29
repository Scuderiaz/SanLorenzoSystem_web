-- Add classification-aware billing support to water rates.
ALTER TABLE water_billing.waterrates
  ADD COLUMN IF NOT EXISTS classification_id INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_waterrates_classification'
  ) THEN
    ALTER TABLE water_billing.waterrates
      ADD CONSTRAINT fk_waterrates_classification
      FOREIGN KEY (classification_id) REFERENCES water_billing.classification(classification_id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- Duplicate legacy unclassified rates across existing classifications so old setups
-- retain equivalent pricing after moving to classification-specific billing.
INSERT INTO water_billing.waterrates (
  classification_id,
  minimum_cubic,
  minimum_rate,
  excess_rate_per_cubic,
  effective_date,
  modified_by,
  modified_date
)
SELECT
  c.classification_id,
  wr.minimum_cubic,
  wr.minimum_rate,
  wr.excess_rate_per_cubic,
  wr.effective_date,
  wr.modified_by,
  COALESCE(wr.modified_date, CURRENT_TIMESTAMP)
FROM water_billing.waterrates wr
CROSS JOIN water_billing.classification c
WHERE wr.classification_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM water_billing.waterrates existing
    WHERE existing.classification_id = c.classification_id
      AND existing.effective_date = wr.effective_date
      AND existing.minimum_cubic = wr.minimum_cubic
      AND existing.minimum_rate = wr.minimum_rate
      AND existing.excess_rate_per_cubic = wr.excess_rate_per_cubic
  );

DELETE FROM water_billing.waterrates
WHERE classification_id IS NULL;
