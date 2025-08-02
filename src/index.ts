import * as XLSX from 'xlsx';
import Chart from 'chart.js/auto';

interface ParsedData {
    sheetName: string;
    headers: string[];
    rows: any[][];
}

interface Transaction {
    date: Date;
    amount: number;
    description: string;
    recipient: string;
}

interface MonthlySpending {
    [category: string]: number;
}

class ExcelParser {
    private fileInput: HTMLInputElement;
    private uploadArea: HTMLElement;
    private tableContainer: HTMLElement;
    private tableHead: HTMLElement;
    private tableBody: HTMLElement;
    private fileInfo: HTMLElement;
    private errorMessage: HTMLElement;
    private sheetTabs: HTMLElement;
    private chartContainer: HTMLElement;
    private monthSelect: HTMLSelectElement;
    private parsedSheets: ParsedData[] = [];
    private currentSheetIndex: number = 0;
    private transactions: Transaction[] = [];
    private currentChart: Chart | null = null;

    constructor() {
        this.fileInput = document.getElementById('fileInput') as HTMLInputElement;
        this.uploadArea = document.getElementById('uploadArea') as HTMLElement;
        this.tableContainer = document.getElementById('tableContainer') as HTMLElement;
        this.tableHead = document.getElementById('tableHead') as HTMLElement;
        this.tableBody = document.getElementById('tableBody') as HTMLElement;
        this.fileInfo = document.getElementById('fileInfo') as HTMLElement;
        this.errorMessage = document.getElementById('errorMessage') as HTMLElement;
        this.sheetTabs = document.getElementById('sheetTabs') as HTMLElement;
        this.chartContainer = document.getElementById('chartContainer') as HTMLElement;
        this.monthSelect = document.getElementById('monthSelect') as HTMLSelectElement;

        this.initializeEventListeners();
    }

    private initializeEventListeners(): void {
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.monthSelect.addEventListener('change', () => this.updateChart());

        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                this.processFile(files[0]);
            }
        });
    }

    private handleFileSelect(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
            this.processFile(file);
        }
    }

    private processFile(file: File): void {
        this.hideError();
        this.hideTable();
        this.hideChart();
        this.parsedSheets = [];
        this.transactions = [];
        this.currentSheetIndex = 0;

        if (!this.isValidFileType(file)) {
            this.showError('Please select a valid Excel file (.xlsx, .xls, or .csv)');
            return;
        }

        this.showFileInfo(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { 
                    type: 'binary',
                    codepage: 1250 // Central European encoding for special characters
                });
                
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1,
                        raw: false,
                        dateNF: 'dd.mm.yyyy'
                    }) as any[][];

                    if (jsonData.length > 0) {
                        const headers = jsonData[0].map(h => String(h || ''));
                        const rows = jsonData.slice(1);
                        
                        this.parsedSheets.push({
                            sheetName,
                            headers,
                            rows
                        });
                    }
                });

                if (this.parsedSheets.length > 0) {
                    this.createSheetTabs();
                    this.displaySheet(0);
                    
                    // Check if this is a bank transaction file
                    if (this.isBankTransactionFile()) {
                        this.parseBankTransactions();
                        this.setupMonthSelector();
                        this.showChart();
                    }
                } else {
                    this.showError('No data found in the file');
                }
            } catch (error) {
                this.showError('Error parsing file: ' + (error as Error).message);
            }
        };

        reader.onerror = () => {
            this.showError('Error reading file');
        };

        reader.readAsBinaryString(file);
    }

    private isBankTransactionFile(): boolean {
        if (this.parsedSheets.length === 0) return false;
        
        const headers = this.parsedSheets[0].headers;
        const bankHeaders = ['DATUM VALUTE', 'BREME', 'NAMEN', 'UDELE'];
        
        return bankHeaders.some(bankHeader => 
            headers.some(header => header.toUpperCase().includes(bankHeader))
        );
    }

    private parseBankTransactions(): void {
        const sheet = this.parsedSheets[0];
        const headers = sheet.headers;
        
        // Find column indices
        const dateIndex = headers.findIndex(h => h.includes('DATUM VALUTE'));
        const amountIndex = headers.findIndex(h => h === 'BREME');
        const purposeIndex = headers.findIndex(h => h === 'NAMEN');
        const recipientIndex = headers.findIndex(h => h.includes('UDELE') && h.includes('NAZIV'));

        if (dateIndex === -1 || amountIndex === -1) {
            console.error('Required columns not found');
            return;
        }

        this.transactions = sheet.rows
            .filter(row => row[dateIndex] && row[amountIndex])
            .map(row => {
                const dateStr = row[dateIndex];
                const dateParts = dateStr.split('.');
                const date = new Date(
                    parseInt(dateParts[2]), 
                    parseInt(dateParts[1]) - 1, 
                    parseInt(dateParts[0])
                );
                
                const amount = parseFloat(row[amountIndex].replace(',', '.')) || 0;
                const description = row[purposeIndex] || 'Unknown';
                const recipient = row[recipientIndex] || 'Unknown';

                return {
                    date,
                    amount,
                    description,
                    recipient
                };
            })
            .filter(t => t.amount > 0); // Only expenses
    }

    private setupMonthSelector(): void {
        if (this.transactions.length === 0) return;

        const months = new Set<string>();
        this.transactions.forEach(t => {
            const monthKey = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
            months.add(monthKey);
        });

        const sortedMonths = Array.from(months).sort().reverse();
        
        this.monthSelect.innerHTML = '';
        sortedMonths.forEach(month => {
            const option = document.createElement('option');
            option.value = month;
            const [year, monthNum] = month.split('-');
            const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            option.textContent = monthName;
            this.monthSelect.appendChild(option);
        });

        if (sortedMonths.length > 0) {
            this.updateChart();
        }
    }

    private categorizeTransaction(transaction: Transaction): string {
        const desc = transaction.description.toUpperCase();
        const recipient = transaction.recipient.toUpperCase();
        
        if (desc.includes('REVOLUT') || desc.includes('PAYPAL')) return 'Digital Payments';
        if (desc.includes('MARKET') || desc.includes('TRGOVINA') || desc.includes('SPAR') || desc.includes('MERCATOR')) return 'Groceries';
        if (desc.includes('RESTAVRACIJA') || desc.includes('GOSTINSTVO') || desc.includes('FOOD')) return 'Restaurants';
        if (desc.includes('BENCIN') || desc.includes('PETROL') || desc.includes('OMV')) return 'Gas';
        if (desc.includes('TELEKOM') || desc.includes('A1') || desc.includes('TELEMACH')) return 'Telecom';
        if (recipient.includes('UNIVERZA')) return 'Education';
        if (desc.includes('ZAVAROVANJE')) return 'Insurance';
        if (desc.includes('NAJEMNINA') || desc.includes('RENT')) return 'Rent';
        
        return 'Other';
    }

    private updateChart(): void {
        const selectedMonth = this.monthSelect.value;
        if (!selectedMonth) return;

        const [year, month] = selectedMonth.split('-').map(Number);
        
        const monthlyTransactions = this.transactions.filter(t => 
            t.date.getFullYear() === year && t.date.getMonth() + 1 === month
        );

        const spending: MonthlySpending = {};
        monthlyTransactions.forEach(t => {
            const category = this.categorizeTransaction(t);
            spending[category] = (spending[category] || 0) + t.amount;
        });

        this.drawChart(spending);
    }

    private drawChart(spending: MonthlySpending): void {
        const canvas = document.getElementById('spendingChart') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return;

        if (this.currentChart) {
            this.currentChart.destroy();
        }

        const labels = Object.keys(spending);
        const data = Object.values(spending).map(v => Math.round(v * 100) / 100);
        
        this.currentChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#FF6384',
                        '#36A2EB',
                        '#FFCE56',
                        '#4BC0C0',
                        '#9966FF',
                        '#FF9F40',
                        '#FF6384',
                        '#C9CBCF',
                        '#4BC0C0'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${label}: €${value.toFixed(2)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    private isValidFileType(file: File): boolean {
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ];
        const validExtensions = ['.xlsx', '.xls', '.csv'];
        
        return validTypes.includes(file.type) || 
               validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    }

    private showFileInfo(file: File): void {
        this.fileInfo.innerHTML = `
            <strong>File:</strong> ${file.name}<br>
            <strong>Size:</strong> ${this.formatFileSize(file.size)}<br>
            <strong>Type:</strong> ${file.type || 'Unknown'}
        `;
        this.fileInfo.style.display = 'block';
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private createSheetTabs(): void {
        if (this.parsedSheets.length <= 1) {
            this.sheetTabs.style.display = 'none';
            return;
        }

        this.sheetTabs.innerHTML = '';
        this.parsedSheets.forEach((sheet, index) => {
            const tab = document.createElement('div');
            tab.className = 'sheet-tab';
            tab.textContent = sheet.sheetName;
            tab.addEventListener('click', () => this.displaySheet(index));
            this.sheetTabs.appendChild(tab);
        });
        this.sheetTabs.style.display = 'block';
    }

    private displaySheet(index: number): void {
        this.currentSheetIndex = index;
        const sheet = this.parsedSheets[index];

        document.querySelectorAll('.sheet-tab').forEach((tab, i) => {
            tab.classList.toggle('active', i === index);
        });

        this.renderTable(sheet);
        this.showTable();
    }

    private renderTable(data: ParsedData): void {
        this.tableHead.innerHTML = '';
        this.tableBody.innerHTML = '';

        const headerRow = document.createElement('tr');
        data.headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        });
        this.tableHead.appendChild(headerRow);

        data.rows.forEach(row => {
            const tr = document.createElement('tr');
            data.headers.forEach((_, index) => {
                const td = document.createElement('td');
                td.textContent = row[index] || '';
                tr.appendChild(td);
            });
            this.tableBody.appendChild(tr);
        });
    }

    private showTable(): void {
        this.tableContainer.style.display = 'block';
    }

    private hideTable(): void {
        this.tableContainer.style.display = 'none';
        this.sheetTabs.style.display = 'none';
    }

    private showChart(): void {
        this.chartContainer.style.display = 'block';
    }

    private hideChart(): void {
        this.chartContainer.style.display = 'none';
    }

    private showError(message: string): void {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
    }

    private hideError(): void {
        this.errorMessage.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ExcelParser();
});