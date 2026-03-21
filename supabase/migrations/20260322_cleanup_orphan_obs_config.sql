-- Clean up observation_config on goals where measurement_type is not 'Observation'
-- These are orphaned configs from goals that were changed away from Observation type
UPDATE goals 
SET observation_config = NULL 
WHERE observation_config IS NOT NULL 
  AND (measurement_type IS NULL OR measurement_type != 'Observation');
