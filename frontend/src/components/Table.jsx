// `columns` is [{ key, header, render?, hideOnMobile? }]. A column without a
// `render` shows row[key] as-is.
//
// The table is wrapped in its own scroll container so a wide row never makes
// the whole page scroll sideways on a phone (NFR-USE-02).
const Table = ({ columns, rows, rowKey = (row) => row.id, onRowClick, caption }) => (
  <div className="table-wrap">
    <table className="table">
      {caption && <caption className="table__caption">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={column.hideOnMobile ? 'table__cell--wide' : undefined}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            className={onRowClick ? 'table__row--clickable' : undefined}
            // A row is a shortcut, not the only way in: every row also carries a
            // real link in its first cell, so keyboard and screen-reader users
            // are not dependent on this handler.
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((column) => (
              <td key={column.key} className={column.hideOnMobile ? 'table__cell--wide' : undefined}>
                {column.render ? column.render(row) : row[column.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default Table;
