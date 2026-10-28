/** A parameter or a result column of a prepared statement */
export interface PreparedStatementField {
    /** The parameter name ("1", "2", ... for positional parameters) or the column name */
    name: string;
    /** The DuckDB type, e.g. INTEGER, VARCHAR[] or DECIMAL(10,2). UNKNOWN if it could not be resolved */
    type: string;
}

/** The parameters, result columns and statement type of a prepared statement */
export interface PreparedStatementDescription {
    /** The statement type, e.g. SELECT or INSERT */
    statementType: string;
    /** What executing the statement returns: QUERY_RESULT, CHANGED_ROWS or NOTHING */
    returnType: string;
    /** The parameters in index order */
    parameters: PreparedStatementField[];
    /** The result columns in order */
    columns: PreparedStatementField[];
}
