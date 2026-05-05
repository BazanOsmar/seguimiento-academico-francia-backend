/* ── Flatpickr en inputs de fecha ──────────────────────────────── */
(function () {
    if (typeof flatpickr === 'undefined') return;

    const LOCALE_ES = {
        firstDayOfWeek: 1,
        weekdays: {
            shorthand: ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],
            longhand:  ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"],
        },
        months: {
            shorthand: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],
            longhand:  ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
        },
        rangeSeparator: " a ",
        time_24hr: true,
    };

    // Filtro principal
    flatpickr('#inputFecha', {
        locale:        LOCALE_ES,
        dateFormat:    'Y-m-d',
        maxDate:       'today',
        disableMobile: true,
        allowInput:    false,
        onChange: function (_, dateStr) {
            const el = document.getElementById('inputFecha');
            if (el) el.dispatchEvent(new Event('change'));
        },
    });

    // Export: posición automática relativa al viewport (default)
    flatpickr('#exportFechaDesde', {
        locale:        LOCALE_ES,
        dateFormat:    'Y-m-d',
        disableMobile: true,
        allowInput:    false,
    });
    flatpickr('#exportFechaHasta', {
        locale:        LOCALE_ES,
        dateFormat:    'Y-m-d',
        disableMobile: true,
        allowInput:    false,
    });

    // Resumen día — selector de fecha
    flatpickr('#inputResumenFecha', {
        locale:        LOCALE_ES,
        dateFormat:    'Y-m-d',
        maxDate:       'today',
        disableMobile: true,
        allowInput:    false,
        onChange: function (_, dateStr) {
            const el = document.getElementById('inputResumenFecha');
            if (el) el.dispatchEvent(new Event('change'));
        },
    });
})();
