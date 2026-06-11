-- Try variations to be sure
UPDATE "DynamicTable" SET internalName = 'leads' WHERE name = 'Leads';
UPDATE "DynamicTable" SET internalName = 'leadPipelines' WHERE name IN ('Lead Pipelines', 'Pipelines de Lead');
UPDATE "DynamicTable" SET internalName = 'leadStages' WHERE name IN ('Lead Stages', 'Etapas de Lead');
UPDATE "DynamicTable" SET internalName = 'leadProposals' WHERE name = 'Lead Proposals';
UPDATE "DynamicTable" SET internalName = 'leadActivities' WHERE name = 'Lead Activities';
UPDATE "DynamicTable" SET internalName = 'units' WHERE name = 'Units';
UPDATE "DynamicTable" SET internalName = 'employees' WHERE name = 'Employees';
UPDATE "DynamicTable" SET internalName = 'appointments' WHERE name = 'Appointments';
UPDATE "DynamicTable" SET internalName = 'services' WHERE name IN ('Services', 'services');

UPDATE dynamicTable SET internalName = 'leads' WHERE name = 'Leads';
UPDATE dynamicTable SET internalName = 'leadPipelines' WHERE name IN ('Lead Pipelines', 'Pipelines de Lead');
UPDATE dynamicTable SET internalName = 'leadStages' WHERE name IN ('Lead Stages', 'Etapas de Lead');
UPDATE dynamicTable SET internalName = 'leadProposals' WHERE name = 'Lead Proposals';
UPDATE dynamicTable SET internalName = 'leadActivities' WHERE name = 'Lead Activities';

UPDATE DynamicTable SET internalName = 'leads' WHERE name = 'Leads';
UPDATE DynamicTable SET internalName = 'leadPipelines' WHERE name IN ('Lead Pipelines', 'Pipelines de Lead');
UPDATE DynamicTable SET internalName = 'leadStages' WHERE name IN ('Lead Stages', 'Etapas de Lead');
UPDATE DynamicTable SET internalName = 'leadProposals' WHERE name = 'Lead Proposals';
UPDATE DynamicTable SET internalName = 'leadActivities' WHERE name = 'Lead Activities';
