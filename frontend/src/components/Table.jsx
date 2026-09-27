// `columns` is [{ key, header, render?, hideOnMobile?, className? }]. A column
// without a `render` shows row[key] as-is. `className` lands on both the header
// and the body cells of that column, which is what a fixed-layout table needs to
// size it.
//
// `fixed` switches the table to a fixed layout: it is exactly as wide as its
// container, and long text wraps inside its column instead of pushing the table
// wider. Use it for tables that must never scroll sideways on a desktop.
//
// The table is wrapped in its own scroll container so a wide row never makes
// the whole page scroll sideways on a phone (NFR-USE-02).
const cellClass = (column) =>
  [column.hideOnMobile && 'table__cell--wide', column.className].filter(Boolean).join(' ') || undefined;

const Table = ({ columns, rows, rowKey = (row) => row.id, onRowClick, caption, fixed = false }) => (
  <div className="table-wrap">
    <table className={fixed ? 'table table--fixed' : 'table'}>
      {caption && <caption className="table__caption">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={cellClass(column)}>
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
              <td key={column.key} className={cellClass(column)}>
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
