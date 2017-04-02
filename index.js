var fs = require('fs');
// var tls = require('tls');
var http = require('http');

let PORT = 8081;
let IMAGES_PATH = __dirname + '/images';

console.log('Listening on port:', PORT);

http.createServer(function (request, response)
{
	console.log('Request:', request.url);

	if (request.url === '/list')
	{
		// send image file list
		response.setHeader('Content-Type', 'application/json');
		response.writeHead(200);

		response.write(JSON.stringify(fs.readdirSync(IMAGES_PATH)
			.filter(function (item) { return !item.startsWith('.'); })));
	}
	else if (request.url.startsWith('/get'))
	{
		let urlParts = request.url.split('/')
			.filter(function (item) { return item && item !== 'get'; });
		
		let filePath = IMAGES_PATH + '/' + urlParts[0];
		
		if (fs.existsSync(filePath))
		{
			let stats = fs.statSync(filePath);
			let file = fs.openSync(filePath, 'r');

			switch (urlParts.length)
			{
				case 1:
					// send whole file
					response.setHeader('Content-Type', 'iamge/picts');
					response.setHeader('Content-Length', stats.size);
					response.writeHead(200);

					// for simplicity, read whole file
					//	test files are not very big
					var buffer = new Buffer.allocUnsafe(stats.size);

					// send file
					fs.readSync(file, buffer, 0, buffer.length);
					response.write(buffer, 'binary');
					fs.closeSync(file);
					break;
				case 2:
					// send one or more layers
					let layerParts = urlParts[1].split('-');
					
					let start = parseInt(layerParts[0]),
						end = start;

					if (layerParts.length == 2)
						end = parseInt(layerParts[1]);
					
					if (start < 1 || end > 8)
					{
						response.writeHead(400);
						break;
					}

					console.log('sending layers: ' + start + " - " + end);

					var position = 0, layerCount = 8;
					var buffers = [];

					console.log('read header');
					var buffer = new Buffer.allocUnsafe(22);
					fs.readSync(file, buffer, 0, buffer.length, position);

					if (start === 1)
					{
						buffer.writeUInt8((buffer.readInt32LE(5) & 0xf0) | (end & 0x0f), 5);
						// end
						buffers.push(buffer);
					}

					position += buffer.length;

					console.log('layers:', layerCount = buffer.readInt32LE(5) & 0x0f);
					console.log('width: ', buffer.readInt32LE(6));
					console.log('height:', buffer.readInt32LE(10));

					for (var i = 0; i < layerCount; i++)
					{
						if (i + 1 > end)
						{
							console.log('Done.');
							break;
						}

						var includeLayer = i + 1 >= start && i + 1 <= end;
						
						// read tree entry count
						//	entries are 9B
						var entryCountBuffer = new Buffer.allocUnsafe(4);
						console.log('treeSize location:', position);
						position += fs.readSync(file, entryCountBuffer, 0, entryCountBuffer.length, position);

						var treeSize = entryCountBuffer.readInt32LE();
						console.log('treeSize:', treeSize, '|', treeSize * 9, 'B');
						treeSize *= 9;

						if (includeLayer)
						{
							console.log('layer included:', i + 1);
							buffers.push(entryCountBuffer);
						}
						else
							console.log('layer skipped:', i + 1);

						// read tree
						var treeBuffer = new Buffer.allocUnsafe(treeSize);
						console.log('treeBuffer.length:', treeBuffer.length);
						console.log('treeBuffer bytes read:', fs.readSync(file, treeBuffer, 0, treeBuffer.length, position));
						position += treeBuffer.length;
						includeLayer && buffers.push(treeBuffer);

						// read layer length
						var layerLengthBuffer = new Buffer.allocUnsafe(4);
						console.log('layerLengthBuffer bytes read:', fs.readSync(file, layerLengthBuffer, 0, layerLengthBuffer.length, position));
						position += layerLengthBuffer.length;
						includeLayer && buffers.push(layerLengthBuffer);

						var layerLength = layerLengthBuffer.readInt32LE();
						console.log('layerLength:', layerLength);

						var layerBuffer = new Buffer.allocUnsafe(layerLength);
						console.log('layerBuffer bytes read:', fs.readSync(file, layerBuffer, 0, layerBuffer.length, position));
						position += layerBuffer.length;
						includeLayer && buffers.push(layerBuffer);
						
						console.log('Total:', position);
						console.log('=========================');
					}

					let imageData = Buffer.concat(buffers);

					// we're ok if we got here
					response.setHeader('Content-Type', 'iamge/picts');
					response.setHeader('Content-Length', imageData.length);
					response.writeHead(200);

					response.write(imageData, 'binary');

					fs.closeSync(file);
					break;
				default:
					response.writeHead(400);
					break;
			}
		}
		else
			response.writeHead(404);
	}
	else
		response.writeHead(404);
	
	response.end();
}).listen(8081);