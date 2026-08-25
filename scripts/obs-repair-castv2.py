import json
from websocket import create_connection

ws = create_connection('ws://127.0.0.1:4455', timeout=10)
ws.recv()
ws.send(json.dumps({'op': 1, 'd': {'rpcVersion': 1}}))
ws.recv()

def request(req_type, req_data=None, rid='r'):
    ws.send(json.dumps({'op': 6, 'd': {'requestType': req_type, 'requestId': rid,
                                       'requestData': req_data or {}}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('op') == 7 and msg['d'].get('requestId') == rid:
            return msg['d']

# Repair cast-v2: correct shader file + opaque colors (cast-metal blue look)
r = request('SetSourceFilterSettings', {
    'sourceName': 'Video Capture Device',
    'filterName': 'cast-v2',
    'filterSettings': {
        'shader_text_file': '/Users/adam/Documents/CAST/cast-metal/obs-shader/cast-dither-v2.effect',
        'load_text_from_file': True,
        'grad_a': {'r': 0.34, 'g': 0.33, 'b': 1.0, 'a': 1.0},
        'grad_b': {'r': 0.40, 'g': 0.43, 'b': 0.68, 'a': 1.0},
        'bg_color': {'r': 0.04, 'g': 0.04, 'b': 0.06, 'a': 1.0},
        'alpha_threshold': 0.7,
        'contrast_amt': 1.5,
        'brightness_amt': 1.0,
        'dither_type': 2.0,
        'distortion_amplitude': 0.02,
        'distortion_frequency': 20.0,
        'distortion_speed': 2.0
    }
})
print('cast-v2 repaired:', r['requestStatus'].get('result'))

# Verify
r = request('GetSourceFilterList', {'sourceName': 'Video Capture Device'})
for f in r['responseData']['filters']:
    if f['filterName'] == 'cast-v2':
        fs = f.get('filterSettings', {})
        print('file:', fs.get('shader_text_file', '?').split('/')[-1])
        print('enabled:', f.get('filterEnabled'))
ws.close()
