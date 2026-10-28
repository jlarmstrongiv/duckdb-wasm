import * as duckdb from '../src/';

const SETUP = [
    'CREATE TABLE describe_t (id INTEGER, msg VARCHAR, level VARCHAR, n INTEGER)',
    "CREATE TYPE describe_mood AS ENUM ('happy', 'sad')",
];
const TEARDOWN = ['DROP TABLE IF EXISTS describe_t', 'DROP TYPE IF EXISTS describe_mood'];

interface DescribeTest {
    name: string;
    sql: string;
    expected: duckdb.PreparedStatementDescription;
}

const DESCRIBE_TESTS: DescribeTest[] = [
    {
        name: 'named parameters',
        sql: 'select id, msg from describe_t where id = $id and level = $lvl',
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [
                { name: 'id', type: 'INTEGER' },
                { name: 'lvl', type: 'VARCHAR' },
            ],
            columns: [
                { name: 'id', type: 'INTEGER' },
                { name: 'msg', type: 'VARCHAR' },
            ],
        },
    },
    {
        name: 'positional parameters',
        sql: 'select msg from describe_t where id = ? and level = ?',
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [
                { name: '1', type: 'INTEGER' },
                { name: '2', type: 'VARCHAR' },
            ],
            columns: [{ name: 'msg', type: 'VARCHAR' }],
        },
    },
    {
        name: 'numbered parameters',
        sql: 'select msg from describe_t where level = $2 and id = $1',
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [
                { name: '1', type: 'INTEGER' },
                { name: '2', type: 'VARCHAR' },
            ],
            columns: [{ name: 'msg', type: 'VARCHAR' }],
        },
    },
    {
        name: 'nested and special result types',
        sql: `select
                ['a', 'b'] as list,
                {'host': 'h', 'pid': 1} as struct,
                map(['k'], [1]) as map,
                'happy'::describe_mood as mood,
                1::hugeint as huge,
                1.5::decimal(10,2) as dec,
                [1.0, 2.0, 3.0]::float[3] as arr`,
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [],
            columns: [
                { name: 'list', type: 'VARCHAR[]' },
                { name: 'struct', type: 'STRUCT(host VARCHAR, pid INTEGER)' },
                { name: 'map', type: 'MAP(VARCHAR, INTEGER)' },
                { name: 'mood', type: "ENUM('happy', 'sad')" },
                { name: 'huge', type: 'HUGEINT' },
                { name: 'dec', type: 'DECIMAL(10,2)' },
                { name: 'arr', type: 'FLOAT[3]' },
            ],
        },
    },
    {
        name: 'from first',
        sql: 'from describe_t select msg, id + 1 as next_id where level = $lvl',
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [{ name: 'lvl', type: 'VARCHAR' }],
            columns: [
                { name: 'msg', type: 'VARCHAR' },
                { name: 'next_id', type: 'INTEGER' },
            ],
        },
    },
    {
        name: 'qualify',
        sql: 'select id, row_number() over (partition by level order by id) as rn from describe_t qualify rn <= ?',
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [{ name: '1', type: 'BIGINT' }],
            columns: [
                { name: 'id', type: 'INTEGER' },
                { name: 'rn', type: 'BIGINT' },
            ],
        },
    },
    {
        name: 'select exclude',
        sql: 'select * exclude (msg, level) from describe_t',
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [],
            columns: [
                { name: 'id', type: 'INTEGER' },
                { name: 'n', type: 'INTEGER' },
            ],
        },
    },
    {
        name: 'group by all',
        sql: 'select level, count(*) as c, sum(n) as total from describe_t group by all',
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [],
            columns: [
                { name: 'level', type: 'VARCHAR' },
                { name: 'c', type: 'BIGINT' },
                { name: 'total', type: 'HUGEINT' },
            ],
        },
    },
    {
        name: 'unresolvable parameter',
        sql: 'select $x as y',
        expected: {
            statementType: 'SELECT',
            returnType: 'QUERY_RESULT',
            columnsKnown: false,
            parameters: [{ name: 'x', type: 'UNKNOWN' }],
            columns: [],
        },
    },
    {
        name: 'insert without returning',
        sql: 'insert into describe_t (id, msg) values (?, ?)',
        expected: {
            statementType: 'INSERT',
            returnType: 'CHANGED_ROWS',
            columnsKnown: true,
            parameters: [
                { name: '1', type: 'INTEGER' },
                { name: '2', type: 'VARCHAR' },
            ],
            columns: [{ name: 'Count', type: 'BIGINT' }],
        },
    },
    {
        name: 'insert returning',
        sql: 'insert into describe_t (id, msg) values ($id, $msg) returning id, msg',
        expected: {
            statementType: 'INSERT',
            returnType: 'QUERY_RESULT',
            columnsKnown: true,
            parameters: [
                { name: 'id', type: 'INTEGER' },
                { name: 'msg', type: 'VARCHAR' },
            ],
            columns: [
                { name: 'id', type: 'INTEGER' },
                { name: 'msg', type: 'VARCHAR' },
            ],
        },
    },
];

export function testPreparedDescribe(db: () => duckdb.DuckDBBindings): void {
    let conn: duckdb.DuckDBConnection;
    describe('Prepared statement describe', () => {
        beforeEach(() => {
            conn = db().connect();
            for (const sql of SETUP) conn.query(sql);
        });
        afterEach(() => {
            for (const sql of TEARDOWN) conn.query(sql);
            conn.close();
        });

        for (const test of DESCRIBE_TESTS) {
            it(test.name, () => {
                const stmt = conn.prepare(test.sql);
                expect(stmt.describe()).toEqual(test.expected);
                stmt.close();
            });
        }
        it('does not execute the statement', () => {
            const stmt = conn.prepare('insert into describe_t (id, msg) values (?, ?)');
            stmt.describe();
            stmt.close();
            expect(conn.query('select count(*)::integer as c from describe_t').toArray()[0].c).toEqual(0);
        });
        it('can still run after describe', () => {
            const stmt = conn.prepare('select ?::integer + 1 as v');
            expect(stmt.describe().columns).toEqual([{ name: 'v', type: 'INTEGER' }]);
            expect(stmt.query(41).toArray()[0].v).toEqual(42);
            stmt.close();
        });
        it('throws after close', () => {
            const stmt = conn.prepare('select 1');
            stmt.close();
            expect(() => stmt.describe()).toThrowError(/No prepared statement found with ID/);
        });
    });
}

export function testPreparedDescribeAsync(db: () => duckdb.AsyncDuckDB): void {
    let conn: duckdb.AsyncDuckDBConnection;
    describe('Prepared statement describe Async', () => {
        beforeEach(async () => {
            conn = await db().connect();
            for (const sql of SETUP) await conn.query(sql);
        });
        afterEach(async () => {
            for (const sql of TEARDOWN) await conn.query(sql);
            await conn.close();
        });

        for (const test of DESCRIBE_TESTS) {
            it(test.name, async () => {
                const stmt = await conn.prepare(test.sql);
                expect(await stmt.describe()).toEqual(test.expected);
                await stmt.close();
            });
        }
        it('does not execute the statement', async () => {
            const stmt = await conn.prepare('insert into describe_t (id, msg) values (?, ?)');
            await stmt.describe();
            await stmt.close();
            const result = await conn.query('select count(*)::integer as c from describe_t');
            expect(result.toArray()[0].c).toEqual(0);
        });
        it('can still run after describe', async () => {
            const stmt = await conn.prepare('select ?::integer + 1 as v');
            expect((await stmt.describe()).columns).toEqual([{ name: 'v', type: 'INTEGER' }]);
            expect((await stmt.query(41)).toArray()[0].v).toEqual(42);
            await stmt.close();
        });
        it('throws after close', async () => {
            const stmt = await conn.prepare('select 1');
            await stmt.close();
            await expectAsync(stmt.describe()).toBeRejectedWithError(/No prepared statement found with ID/);
        });
    });
}
