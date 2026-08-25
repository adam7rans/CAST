import json
from websocket import create_connection

ws = create_connection('ws://127.0.0.1:4455', timeout=10)
ws.recv()  # hello
ws.send(json.dumps({'op': 1, 'd': {'rpcVersion': 1}}))
ws.recv()  # identified

def request(req_type, req_data=None, rid='r'):
    ws.send(json.dumps({'op': 6, 'd': {'requestType': req_type, 'requestId': rid,
                                       'requestData': req_data or {}}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('op') == 7 and msg['d'].get('requestId') == rid:
            return msg['d']

r = request('GetSceneList', rid='s')
print('scenes:', [x['sceneName'] for x in r['responseData']['scenes']])

r = request('CreateSourceFilter', {
    'sceneName': 'cam',
    'sourceName': 'Video Capture Device',
    'filterName': 'cast-v2',
    'filterKind': 'shader_filter'
}, 'c')
print('create:', r['requestStatus'].get('result'), r['requestStatus'].get('comment', ''))

r = request('SetSourceFilterSettings', {
    'sourceName': 'Video Capture Device',
    'filterName': 'cast-v2',
    'filterSettings': {
        'shader_text_file': '/Users/adam/Documents/CAST/cast-metal/obs-shader/cast-dither-v2.effect',
        'load_text_from_file': True
    }
}, 'cfg')
print('configure:', r['requestStatus'].get('result'))

r = request('GetSourceFilterList', {'sourceName': 'Video Capture Device'}, 'l')
print('filters:', [f['filterName'] for f in r['responseData']['filters']])
ws.close()
