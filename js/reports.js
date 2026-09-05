let charts = {};
let currentYearData = [];
let passengers = [];

CarpoolApp.init('reports', async function() {
    initYearSelector();
    await loadDataForYear(parseInt(document.getElementById('yearSelector').value));
    
    document.getElementById('yearSelector').addEventListener('change', async (e) => {
        await loadDataForYear(parseInt(e.target.value));
    });

    document.getElementById('btnExportTrips').addEventListener('click', exportTripsCSV);
    document.getElementById('btnExportSettlements').addEventListener('click', exportSettlementsCSV);
    
    document.getElementById('btnBackup').addEventListener('click', async () => {
        try {
            await CarpoolApp.backupAll();
        } catch(err) {
            CarpoolApp.showToast('Backup failed: ' + err.message, 'danger');
        }
    });

    const restoreInput = document.getElementById('restoreFileInput');
    document.getElementById('btnRestore').addEventListener('click', () => {
        restoreInput.click();
    });

    restoreInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            if (confirm('Are you sure you want to restore data? This will OVERWRITE all existing data.')) {
                try {
                    await CarpoolApp.restoreAll(e.target.files[0]);
                    CarpoolApp.showToast('Data restored successfully! Reloading...', 'success');
                    setTimeout(() => location.reload(), 1500);
                } catch(err) {
                    CarpoolApp.showToast('Restore failed: ' + err.message, 'danger');
                }
            }
            e.target.value = ''; // reset
        }
    });
});

function initYearSelector() {
    const selector = document.getElementById('yearSelector');
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 1; y >= currentYear - 5; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === currentYear) opt.selected = true;
        selector.appendChild(opt);
    }
}

async function loadDataForYear(year) {
    try {
        passengers = await CarpoolApp.getPassengers();
        
        // Fetch trips for the selected year
        const startDate = `${year}-01-01`;
        const endDate = `${year + 1}-01-01`;
        
        const snapshot = await CarpoolApp.db.collection('trips')
            .where('date', '>=', startDate)
            .where('date', '<', endDate)
            .orderBy('date')
            .get();
            
        currentYearData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        updateDashboard();
    } catch(err) {
        console.error("Error loading year data:", err);
        CarpoolApp.showToast('Error loading data', 'danger');
    }
}

function updateDashboard() {
    // 1. Process data by month
    const monthlyData = Array.from({length: 12}, () => ({
        trips: 0,
        distance: 0,
        fuelUsed: 0,
        fuelCost: 0,
        passengerShares: {} // pid -> total share
    }));
    
    passengers.forEach(p => {
        monthlyData.forEach(m => m.passengerShares[p.id] = 0);
    });

    let totalTrips = 0;
    let totalDistance = 0;
    let totalFuelCost = 0;
    let totalContributions = 0;
    
    const passengerTotals = {}; // pid -> total share overall
    passengers.forEach(p => passengerTotals[p.id] = 0);

    currentYearData.forEach(trip => {
        if (trip.status === 'cancelled') return;
        
        const monthIndex = new Date(trip.date).getMonth(); // 0-11
        const md = monthlyData[monthIndex];
        
        md.trips++;
        md.distance += (trip.actualDistance || 0);
        md.fuelUsed += (trip.fuelUsed || 0);
        md.fuelCost += (trip.fuelCost || 0);
        
        totalTrips++;
        totalDistance += (trip.actualDistance || 0);
        totalFuelCost += (trip.fuelCost || 0);
        
        if (trip.passengerShares) {
            for (const [pid, amount] of Object.entries(trip.passengerShares)) {
                if (md.passengerShares[pid] !== undefined) {
                    md.passengerShares[pid] += amount;
                    passengerTotals[pid] += amount;
                    totalContributions += amount;
                }
            }
        }
    });

    // 2. Update Summary Cards
    document.getElementById('totalTrips').textContent = totalTrips;
    document.getElementById('totalDistance').textContent = totalDistance.toFixed(1);
    document.getElementById('totalFuelCost').textContent = CarpoolApp.formatCurrency(totalFuelCost);
    document.getElementById('totalContributions').textContent = CarpoolApp.formatCurrency(totalContributions);
    
    // 3. Render Charts
    renderCharts(monthlyData, passengerTotals);
    
    // 4. Update Table
    renderTable(monthlyData);
}

function renderCharts(monthlyData, passengerTotals) {
    const months = CarpoolApp.MONTHS;
    
    const distanceData = monthlyData.map(m => m.distance);
    const fuelCostData = monthlyData.map(m => m.fuelCost);
    const tripsData = monthlyData.map(m => m.trips);
    
    // Destroy existing charts if any
    Object.values(charts).forEach(c => c.destroy());
    
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false
    };

    // 1. Monthly Distance
    charts.distance = new Chart(document.getElementById('monthlyDistanceChart'), {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Distance (km)',
                data: distanceData,
                backgroundColor: '#4361ee'
            }]
        },
        options: commonOptions
    });

    // 2. Monthly Fuel Cost
    charts.fuel = new Chart(document.getElementById('monthlyFuelCostChart'), {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Fuel Cost (₹)',
                data: fuelCostData,
                backgroundColor: '#06d6a0'
            }]
        },
        options: commonOptions
    });

    // 3. Passenger Contributions
    const pNames = [];
    const pData = [];
    passengers.forEach(p => {
        if (passengerTotals[p.id] > 0) {
            pNames.push(p.name);
            pData.push(passengerTotals[p.id]);
        }
    });
    
    charts.contributions = new Chart(document.getElementById('passengerContributionsChart'), {
        type: 'doughnut',
        data: {
            labels: pNames,
            datasets: [{
                data: pData,
                backgroundColor: ['#4361ee', '#7209b7', '#ef476f', '#ff9f1c', '#06d6a0', '#118ab2', '#073b4c']
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += CarpoolApp.formatCurrency(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });

    // 4. Trip Count by Month
    charts.trips = new Chart(document.getElementById('tripCountChart'), {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Trips',
                data: tripsData,
                borderColor: '#118ab2',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

function renderTable(monthlyData) {
    const headerRow = document.getElementById('tableHeaderRow');
    // Clear extra headers
    while (headerRow.children.length > 5) {
        headerRow.removeChild(headerRow.lastChild);
    }
    
    // Add passenger headers
    passengers.forEach(p => {
        const th = document.createElement('th');
        th.textContent = p.name;
        headerRow.appendChild(th);
    });

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    
    let sums = { trips: 0, dist: 0, fuel: 0, cost: 0, pass: {} };
    passengers.forEach(p => sums.pass[p.id] = 0);

    monthlyData.forEach((m, idx) => {
        sums.trips += m.trips;
        sums.dist += m.distance;
        sums.fuel += m.fuelUsed;
        sums.cost += m.fuelCost;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${CarpoolApp.getMonthName(idx)}</td>
            <td>${m.trips}</td>
            <td>${m.distance.toFixed(1)}</td>
            <td>${m.fuelUsed.toFixed(2)}</td>
            <td>${CarpoolApp.formatCurrency(m.fuelCost)}</td>
        `;
        
        passengers.forEach(p => {
            const amt = m.passengerShares[p.id] || 0;
            sums.pass[p.id] += amt;
            const td = document.createElement('td');
            td.textContent = CarpoolApp.formatCurrency(amt);
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
    
    // Footer
    const tfoot = document.getElementById('tableFoot');
    tfoot.innerHTML = `
        <tr>
            <td><strong>Total</strong></td>
            <td>${sums.trips}</td>
            <td>${sums.dist.toFixed(1)}</td>
            <td>${sums.fuel.toFixed(2)}</td>
            <td>${CarpoolApp.formatCurrency(sums.cost)}</td>
            ${passengers.map(p => `<td>${CarpoolApp.formatCurrency(sums.pass[p.id])}</td>`).join('')}
        </tr>
    `;
}

function exportTripsCSV() {
    const headers = ['Date', 'Type', 'Passengers', 'Distance (km)', 'Fuel Used (L)', 'Fuel Cost (₹)', 'Status', 'Notes'];
    const rows = currentYearData.map(trip => {
        let passNames = '';
        if (trip.passengers && trip.passengers.length > 0) {
            passNames = trip.passengers.map(pid => {
                const p = passengers.find(x => x.id === pid);
                return p ? p.name : 'Unknown';
            }).join(', ');
        }
        
        return [
            trip.date,
            trip.type || 'Unknown',
            passNames,
            trip.actualDistance || 0,
            trip.fuelUsed || 0,
            trip.fuelCost || 0,
            trip.status || '',
            trip.notes || ''
        ];
    });
    
    CarpoolApp.exportCSV(headers, rows, `Carpool_Trips_${document.getElementById('yearSelector').value}.csv`);
}

async function exportSettlementsCSV() {
    const year = document.getElementById('yearSelector').value;
    const headers = ['Month', 'Passenger', 'Travel Days', 'Distance (km)', 'Amount (₹)', 'Paid (₹)', 'Pending (₹)'];
    const rows = [];
    
    try {
        for (let m = 0; m < 12; m++) {
            const monthStr = `${year}-${String(m + 1).padStart(2, '0')}`;
            const monthName = CarpoolApp.getMonthName(m);
            
            // Re-aggregate per passenger for this month
            for (const p of passengers) {
                // Get payments for this person, month
                const payments = await CarpoolApp.getPayments({ personId: p.id, month: m+1, year: parseInt(year) });
                let totalPaid = 0;
                payments.forEach(pay => totalPaid += pay.amount);
                
                // Get trips where this person was a passenger in this month
                const tripsInMonth = currentYearData.filter(t => 
                    new Date(t.date).getMonth() === m && 
                    t.passengers && 
                    t.passengers.includes(p.id) &&
                    t.status !== 'cancelled'
                );
                
                let travelDays = tripsInMonth.length;
                let totalDist = 0;
                let totalAmount = 0;
                
                tripsInMonth.forEach(t => {
                    totalDist += (t.actualDistance || 0);
                    if (t.passengerShares && t.passengerShares[p.id]) {
                        totalAmount += t.passengerShares[p.id];
                    }
                });
                
                if (travelDays > 0 || totalPaid > 0) {
                    rows.push([
                        monthName,
                        p.name,
                        travelDays,
                        totalDist.toFixed(1),
                        totalAmount.toFixed(2),
                        totalPaid.toFixed(2),
                        (totalAmount - totalPaid).toFixed(2)
                    ]);
                }
            }
        }
        
        CarpoolApp.exportCSV(headers, rows, `Carpool_Settlements_${year}.csv`);
    } catch(err) {
        console.error("Export Settlements Error:", err);
        CarpoolApp.showToast("Error generating settlement report", 'danger');
    }
}
