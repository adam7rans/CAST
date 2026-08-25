import json, sys
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

patch = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {"alpha_threshold": 0.5}
r = request('SetSourceFilterSettings', {
    'sourceName': 'Video Capture Device',
    'filterName': 'cast-v2',
    'filterSettings': patch,
    'overlay': True
})
print('set:', r['requestStatus'].get('result'))
r = request('GetSourceFilterSettings', {
    'sourceName': 'Video Capture Device', 'filterName': 'cast-v2'})
fs = r['responseData']['filterSettings']
print('verify:', {k: fs.get(k) for k in list(patch.keys())})
ws.close()
