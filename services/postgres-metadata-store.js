const mapLabelRow = (row = {}) => ({
    _id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    user_id: row.user_id || 'default'
});

const mapContactRow = (row = {}) => ({
    _id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    company: row.company || '',
    notes: row.notes || ''
});

const ensureLabelsSeeded = async (pool, getCachedLabels) => {
    const existing = await pool.query('SELECT COUNT(*)::int AS total FROM labels');
    if (Number(existing.rows[0]?.total || 0) > 0) {
        return;
    }

    for (const label of (getCachedLabels?.() || [])) {
        await pool.query(
            `INSERT INTO labels (id, name, slug, color, user_id)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [
                String(label._id || `label-${label.slug}`),
                String(label.name || ''),
                String(label.slug || ''),
                String(label.color || '#5f6368'),
                String(label.user_id || 'default')
            ]
        );
    }
};

const ensureContactsSeeded = async (pool, getCachedContacts) => {
    const existing = await pool.query('SELECT COUNT(*)::int AS total FROM contacts');
    if (Number(existing.rows[0]?.total || 0) > 0) {
        return;
    }

    for (const contact of (getCachedContacts?.() || [])) {
        await pool.query(
            `INSERT INTO contacts (id, name, email, phone, company, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [
                String(contact._id || `contact-${contact.email}`),
                String(contact.name || contact.email || ''),
                String(contact.email || ''),
                String(contact.phone || ''),
                String(contact.company || ''),
                String(contact.notes || '')
            ]
        );
    }
};

const ensureSettingsSeeded = async (pool, getCachedSettings) => {
    const existing = await pool.query(
        `SELECT settings_json
         FROM app_settings
         WHERE key = 'global'
         LIMIT 1`
    );
    if (existing.rows[0]?.settings_json) {
        return existing.rows[0].settings_json;
    }

    const cached = getCachedSettings?.() || {};
    const seeded = await pool.query(
        `INSERT INTO app_settings (key, settings_json)
         VALUES ('global', $1::jsonb)
         ON CONFLICT (key)
         DO UPDATE SET settings_json = EXCLUDED.settings_json
         RETURNING settings_json`,
        [cached]
    );

    return seeded.rows[0]?.settings_json || cached;
};

export const createPostgresLabelStore = ({ pool, getCachedLabels }) => ({
    async list() {
        await ensureLabelsSeeded(pool, getCachedLabels);
        const result = await pool.query('SELECT * FROM labels ORDER BY name ASC');
        return result.rows.map(mapLabelRow);
    },

    async findById(id) {
        const result = await pool.query('SELECT * FROM labels WHERE id = $1 LIMIT 1', [id]);
        return result.rows[0] ? mapLabelRow(result.rows[0]) : null;
    },

    async findBySlug(slug) {
        const result = await pool.query('SELECT * FROM labels WHERE slug = $1 LIMIT 1', [slug]);
        return result.rows[0] ? mapLabelRow(result.rows[0]) : null;
    },

    async create(label = {}) {
        const result = await pool.query(
            `INSERT INTO labels (id, name, slug, color, user_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                String(label._id || `label-${label.slug}`),
                String(label.name || ''),
                String(label.slug || ''),
                String(label.color || '#5f6368'),
                String(label.user_id || 'default')
            ]
        );
        return mapLabelRow(result.rows[0]);
    },

    async update(id, updates = {}) {
        const result = await pool.query(
            `UPDATE labels
             SET name = COALESCE($2, name),
                 slug = COALESCE($3, slug),
                 color = COALESCE($4, color)
             WHERE id = $1
             RETURNING *`,
            [id, updates.name ?? null, updates.slug ?? null, updates.color ?? null]
        );
        return result.rows[0] ? mapLabelRow(result.rows[0]) : null;
    },

    async delete(id) {
        const result = await pool.query('DELETE FROM labels WHERE id = $1 RETURNING *', [id]);
        return result.rows[0] ? mapLabelRow(result.rows[0]) : null;
    }
});

export const createPostgresContactStore = ({ pool, getCachedContacts }) => ({
    async list() {
        await ensureContactsSeeded(pool, getCachedContacts);
        const result = await pool.query('SELECT * FROM contacts ORDER BY name ASC');
        return result.rows.map(mapContactRow);
    },

    async findById(id) {
        const result = await pool.query('SELECT * FROM contacts WHERE id = $1 LIMIT 1', [id]);
        return result.rows[0] ? mapContactRow(result.rows[0]) : null;
    },

    async create(contact = {}) {
        const result = await pool.query(
            `INSERT INTO contacts (id, name, email, phone, company, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                String(contact._id || `contact-${String(contact.email || '').replace(/[^a-z0-9]+/gi, '-')}`),
                String(contact.name || contact.email || ''),
                String(contact.email || ''),
                String(contact.phone || ''),
                String(contact.company || ''),
                String(contact.notes || '')
            ]
        );
        return mapContactRow(result.rows[0]);
    },

    async update(id, updates = {}) {
        const result = await pool.query(
            `UPDATE contacts
             SET name = COALESCE($2, name),
                 email = COALESCE($3, email),
                 phone = COALESCE($4, phone),
                 company = COALESCE($5, company),
                 notes = COALESCE($6, notes)
             WHERE id = $1
             RETURNING *`,
            [id, updates.name ?? null, updates.email ?? null, updates.phone ?? null, updates.company ?? null, updates.notes ?? null]
        );
        return result.rows[0] ? mapContactRow(result.rows[0]) : null;
    },

    async delete(id) {
        const result = await pool.query('DELETE FROM contacts WHERE id = $1 RETURNING *', [id]);
        return result.rows[0] ? mapContactRow(result.rows[0]) : null;
    }
});

export const createPostgresSettingsStore = ({ pool, getCachedSettings }) => ({
    async get() {
        return ensureSettingsSeeded(pool, getCachedSettings);
    },

    async save(settings = {}) {
        const result = await pool.query(
            `INSERT INTO app_settings (key, settings_json)
             VALUES ('global', $1::jsonb)
             ON CONFLICT (key)
             DO UPDATE SET settings_json = EXCLUDED.settings_json
             RETURNING settings_json`,
            [settings]
        );
        return result.rows[0]?.settings_json || settings;
    }
});
