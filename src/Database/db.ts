import { Pool } from 'pg';

import config from '../../config/database.json';

// Create a database instance
const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password
});

export default pool;