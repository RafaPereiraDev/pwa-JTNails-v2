-- =============================================================================
-- Migration: Remoção Definitiva Específica de "Mão + Pé" & Ajuste de FK
-- =============================================================================

-- 1. Garante que appointments.service_id possa ser nulo
ALTER TABLE appointments ALTER COLUMN service_id DROP NOT NULL;

-- 2. Ajusta a FK para ON DELETE SET NULL se necessário
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_service_id_fkey' AND table_name = 'appointments'
  ) THEN
    ALTER TABLE appointments DROP CONSTRAINT appointments_service_id_fkey;
    ALTER TABLE appointments ADD CONSTRAINT appointments_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Desvincula qualquer agendamento existente vinculado ao serviço "Mão + Pé"
UPDATE appointments
SET service_id = NULL
WHERE service_id IN (
  SELECT id FROM services WHERE name ILIKE '%Mão + Pé%' OR name ILIKE '%Mao + Pe%'
);

-- 4. Exclusão física definitiva apenas do registro "Mão + Pé"
DELETE FROM services
WHERE name ILIKE '%Mão + Pé%' OR name ILIKE '%Mao + Pe%';
