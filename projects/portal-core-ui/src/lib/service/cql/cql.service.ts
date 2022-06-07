

export class CQLService {

    /**
     * Assembles a CQL string using filters
     * 
     * @param filters filter specification for a layer [ { predicate: string, value: []|string,  xpath: string }, ... ]
     * @returns string
     */
    public static assembleQuery(filters): string {
        let cql_str = "";
        for (const filt of filters) {
            if (filt.predicate.toUpperCase() === 'CQL_LIKE') {
                // Transform the selected filter values into a CQL query string
                let sub_str = "";
                // Array of values
                if (filt.value instanceof Array) {
                    for (const val of filt.value) {
                        sub_str += filt.xpath + " LIKE '%" + val + "%' OR "
                    }
                    // Trim off " OR " at end of string
                    sub_str = sub_str.substring(0, sub_str.length - 4);

                // Single value
                } else if (typeof filt.value === "string") {
                    sub_str = filt.xpath + " LIKE '%" + filt.value + "%'";
                }
                cql_str += sub_str
            }
        }
        return cql_str;
    }
}
