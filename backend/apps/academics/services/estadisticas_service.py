"""
Servicio de estadísticas de notas para el panel del profesor.

Normaliza todas las notas a escala 0-100 con la ponderación de dimensiones:
  saber=45, hacer=40, ser=10  → total máximo=95 → normalizado a 100.
"""
from .notas_mongo_service import _get_db

_MAX_DIM = {'saber': 45.0, 'hacer': 40.0, 'ser': 10.0}


def estadisticas_notas_profesor(profesor_id: int, gestion: int, curso_ids=None) -> dict:
    """
    Una sola consulta MongoDB que retorna todo lo necesario para el panel.

    Returns:
        {
            'promedio_general': float | None,
            'cursos': {curso_id: {'promedio', 't1', 't2', 't3'}},
            'est_promedios': {(eid, cid): {'nombre', 'promedio', 'trim_scores'}},
            'trimestres': [{'trimestre', 'promedio', 'delta'}],
        }
    """
    match_q = {'profesor_id': profesor_id, 'gestion': gestion}
    if curso_ids:
        match_q['curso_id'] = {'$in': list(curso_ids)}

    try:
        col = _get_db()['detalle_notas']
        docs = list(col.aggregate([
            {'$match': match_q},
            {'$group': {
                '_id': {
                    'eid':  '$estudiante_id',
                    'cid':  '$curso_id',
                    'trim': '$trimestre',
                    'dim':  '$dimension',
                },
                'nombre':   {'$first': '$nombre_estudiante'},
                'avg_nota': {'$avg': '$nota'},
            }},
        ]))
    except Exception:
        return _empty()

    # (eid, cid) → {nombre, trims: {trim: {dim: avg}}}
    est_map = {}
    for doc in docs:
        eid    = doc['_id']['eid']
        cid    = doc['_id']['cid']
        trim   = doc['_id']['trim']
        dim    = doc['_id']['dim'].lower()
        avg    = float(doc.get('avg_nota') or 0)
        nombre = doc.get('nombre') or ''
        key = (eid, cid)
        if key not in est_map:
            est_map[key] = {'nombre': nombre, 'trims': {}}
        est_map[key]['trims'].setdefault(trim, {})[dim] = avg

    # Promedio normalizado 0-100 por estudiante por trimestre
    est_promedios = {}
    for key, data in est_map.items():
        trim_scores = {}
        for trim, dims in data['trims'].items():
            total = sum(dims.get(d, 0) for d in _MAX_DIM if d in dims)
            sobre = sum(_MAX_DIM[d] for d in _MAX_DIM if d in dims)
            if sobre > 0:
                trim_scores[trim] = round(total / sobre * 100, 1)
        if trim_scores:
            promedio = round(sum(trim_scores.values()) / len(trim_scores), 1)
            est_promedios[key] = {
                'nombre':      data['nombre'],
                'promedio':    promedio,
                'trim_scores': trim_scores,
            }

    # Agrupado por curso
    cursos_data = {}
    for (eid, cid), ep in est_promedios.items():
        if cid not in cursos_data:
            cursos_data[cid] = {'all': [], 'trims': {}}
        cursos_data[cid]['all'].append(ep['promedio'])
        for trim, score in ep['trim_scores'].items():
            cursos_data[cid]['trims'].setdefault(trim, []).append(score)

    cursos_result = {}
    for cid, cd in cursos_data.items():
        t = {
            trim: round(sum(sc) / len(sc), 1)
            for trim, sc in cd['trims'].items() if sc
        }
        all_s = cd['all']
        cursos_result[cid] = {
            'promedio': round(sum(all_s) / len(all_s), 1) if all_s else None,
            't1': t.get(1), 't2': t.get(2), 't3': t.get(3),
        }

    # Agrupado por trimestre (global)
    trim_global = {}
    for ep in est_promedios.values():
        for trim, score in ep['trim_scores'].items():
            trim_global.setdefault(trim, []).append(score)

    trim_list = []
    for t in sorted(trim_global.keys()):
        scores = trim_global[t]
        trim_list.append({
            'trimestre': t,
            'promedio':  round(sum(scores) / len(scores), 1),
            'delta':     None,
        })
    for i in range(1, len(trim_list)):
        trim_list[i]['delta'] = round(
            trim_list[i]['promedio'] - trim_list[i - 1]['promedio'], 1
        )

    all_p = [ep['promedio'] for ep in est_promedios.values()]
    promedio_general = round(sum(all_p) / len(all_p), 1) if all_p else None

    return {
        'promedio_general': promedio_general,
        'cursos':           cursos_result,
        'est_promedios':    est_promedios,
        'trimestres':       trim_list,
    }


def _empty():
    return {
        'promedio_general': None,
        'cursos':           {},
        'est_promedios':    {},
        'trimestres':       [],
    }
