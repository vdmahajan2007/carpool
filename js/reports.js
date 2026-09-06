// ============================================================
// js/reports.js — Reports & Data Analytics Logic
// ============================================================

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
            if (confirm('Are you sure you want to restore data? This will OVERWRITE existing data.')) {
                try {
                    const data = await CarpoolApp.importJSON(e.target.files[0]);
                    await CarpoolApp.restoreAll(data);
                } catch(err) {
                    CarpoolApp.showToast('Restore failed: ' + err.message, 'danger');
                }
            }
            e.target.value = '';
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
        passengers = CarpoolApp.getPassengers();
        
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
        CarpoolApp.showToast('Error loading reports data.', 'danger');
    }
}

function updateDashboard() {
    // 1. Process data by month
    const monthlyData = Array.from({ length: 12 }, () => ({
        trips: 0,
        distance: 0,
        fuelUsed: 0,
        fuelCost: 0,
        passengerShares: {}
    }));
    
    passengers.forEach(p => {
        monthlyData.forEach(m => m.passengerShares[p.id] = 0);
    });

    let totalTrips = 0;
    let totalDistance = 0;
    let totalFuelCost = 0;
    let totalContributions = 0;
    
    const passengerTotals = {};
    passengers.forEach(p => passengerTotals[p.id] = 0);

    currentYearData.forEach(trip => {
        if (trip.status === 'Cancelled' || trip.status === 'cancelled') return;
        
        const monthIndex = new Date(trip.date).getMonth();
        const md = monthlyData[monthIndex];
        
        const dist = parseFloat(trip.actualRouteDistance || trip.actualDistance || 0);
        const fuel = parseFloat(trip.fuelUsed || 0);
        const cost = parseFloat(trip.fuelCost || 0);

        md.trips++;
        md.distance += dist;
        md.fuelUsed += fuel;
        md.fuelCost += cost;
        
        totalTrips++;
        totalDistance += dist;
        totalFuelCost += cost;
        
        if (trip.passengerShares) {
            for (const [pid, amount] of Object.entries(trip.passengerShares)) {
                const amt = parseFloat(amount || 0);
                if (md.passengerShares[pid] !== undefined) {
                    md.passengerShares[pid] += amt;
                    passengerTotals[pid] += amt;
                    totalContributions += amt;
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
    
    // Destroy existing charts
    Object.values(charts).forEach(c => {
        if (c && typeof c.destroy === 'function') c.destroy();
    });
    
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
                label: 'Car Distance (km)',
                data: distanceData,
                backgroundColor: '#4361ee',
                borderRadius: 6
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
                backgroundColor: '#06d6a0',
                borderRadius: 6
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
            labels: pNames.length > 0 ? pNames : ['No Data'],
            datasets: [{
                data: pData.length > 0 ? pData : [1],
                backgroundColor: ['#4361ee', '#7209b7', '#ef476f', '#ff9f1c', '#06d6a0', '#118ab2', '#e9ecef']
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) label += CarpoolApp.formatCurrency(context.parsed);
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
                label: 'Completed Trips',
                data: tripsData,
                borderColor: '#118ab2',
                backgroundColor: 'rgba(17, 138, 178, 0.1)',
                tension: 0.2,
                fill: true
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
    while (headerRow.children.length > 5) {
        headerRow.removeChild(headerRow.lastChild);
    }
    
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
            <td class="fw-semibold">${CarpoolApp.getMonthName(idx)}</td>
            <td>${m.trips}</td>
            <td>${m.distance.toFixed(1)} km</td>
            <td>${m.fuelUsed.toFixed(2)} L</td>
            <td class="text-primary fw-bold">${CarpoolApp.formatCurrency(m.fuelCost)}</td>
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
    
    const tfoot = document.getElementById('tableFoot');
    tfoot.innerHTML = `
        <tr class="table-light fw-bold">
            <td>Total</td>
            <td>${sums.trips}</td>
            <td>${sums.dist.toFixed(1)} km</td>
            <td>${sums.fuel.toFixed(2)} L</td>
            <td class="text-primary">${CarpoolApp.formatCurrency(sums.cost)}</td>
            ${passengers.map(p => `<td class="text-primary">${CarpoolApp.formatCurrency(sums.pass[p.id])}</td>`).join('')}
        </tr>
    `;
}

function exportTripsCSV() {
    const headers = ['Date', 'Type', 'Driver', 'Passengers', 'Car Route Distance (km)', 'Fuel Used (L)', 'Fuel Cost (₹)', 'Rate Per KM (₹)', 'Status', 'Notes'];
    const rows = currentYearData.map(trip => {
        let passNames = '';
        if (trip.passengers && trip.passengers.length > 0) {
            passNames = trip.passengers.map(pid => {
                const p = passengers.find(x => x.id === pid);
                const pName = p ? p.name : pid;
                const pDist = trip.passengerDetails?.[pid]?.chargeableDistance || p?.pickupDistance || '';
                return pDist ? `${pName} (${pDist}km)` : pName;
            }).join('; ');
        }
        
        return [
            trip.date,
            trip.type || 'Office',
            trip.driverName || 'Vivek',
            passNames,
            trip.actualRouteDistance || trip.actualDistance || 0,
            trip.fuelUsed || 0,
            trip.fuelCost || 0,
            trip.ratePerKm || '',
            trip.status || 'Completed',
            trip.notes || ''
        ];
    });
    
    CarpoolApp.exportCSV(headers, rows, `Carpool_Trips_${document.getElementById('yearSelector').value}.csv`);
}

async function exportSettlementsCSV() {
    const year = document.getElementById('yearSelector').value;
    const headers = ['Month', 'Passenger', 'Travel Days', 'Passenger Distance (km)', 'Fuel Share (₹)', 'Paid Amount (₹)', 'Pending Due (₹)'];
    const rows = [];
    
    try {
        for (let m = 0; m < 12; m++) {
            const monthName = CarpoolApp.getMonthName(m);
            
            for (const p of passengers) {
                const payments = await CarpoolApp.getPayments({ personId: p.id, month: m, year: parseInt(year) });
                let totalPaid = 0;
                payments.forEach(pay => totalPaid += parseFloat(pay.amount || 0));
                
                const tripsInMonth = currentYearData.filter(t => 
                    new Date(t.date).getMonth() === m && 
                    t.passengers && 
                    (t.passengers.includes(p.id) || t.passengers.includes(p.name)) &&
                    t.status !== 'Cancelled' && t.status !== 'cancelled'
                );
                
                let travelDays = tripsInMonth.length;
                let totalDist = 0;
                let totalAmount = 0;
                
                tripsInMonth.forEach(t => {
                    const pDist = t.passengerDetails?.[p.id]?.chargeableDistance !== undefined 
                        ? parseFloat(t.passengerDetails[p.id].chargeableDistance)
                        : (p.pickupDistance || p.distance || 10) * (t.type === 'Full Day' ? 2 : 1);
                    totalDist += pDist;

                    if (t.passengerShares && t.passengerShares[p.id]) {
                        totalAmount += parseFloat(t.passengerShares[p.id]);
                    }
                });
                
                if (travelDays > 0 || totalPaid > 0) {
                    rows.push([
                        monthName + ' ' + year,
                        p.name,
                        travelDays,
                        totalDist.toFixed(1),
                        totalAmount.toFixed(2),
                        totalPaid.toFixed(2),
                        Math.max(0, totalAmount - totalPaid).toFixed(2)
                    ]);
                }
            }
        }
        
        CarpoolApp.exportCSV(headers, rows, `Carpool_Settlements_${year}.csv`);
    } catch(err) {
        console.error("Export Settlements Error:", err);
        CarpoolApp.showToast("Error generating settlement report.", 'danger');
    }
}
