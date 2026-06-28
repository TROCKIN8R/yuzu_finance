declare module 'jspdf-autotable' {
  import type { jsPDF } from 'jspdf'
  function autoTable(doc: jsPDF, options: Record<string, unknown>): void
  export default autoTable
}
