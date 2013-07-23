/*
JAP
Copyright (C) 2012 Jeroen Van Steirteghem

This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA 02111-1307 USA
*/

var net = require("net");
var websocket = require("streamws");

var setDefaultConfiguration = function(configuration) {
	configuration = configuration || {};
	configuration.REMOTE_PROXY_SERVER = configuration.REMOTE_PROXY_SERVER || {};
	configuration.REMOTE_PROXY_SERVER.TYPE = configuration.REMOTE_PROXY_SERVER.TYPE || "";
	configuration.REMOTE_PROXY_SERVER.ADDRESS = configuration.REMOTE_PROXY_SERVER.ADDRESS || "";
	configuration.REMOTE_PROXY_SERVER.PORT = configuration.REMOTE_PROXY_SERVER.PORT || 0;
	configuration.REMOTE_PROXY_SERVER.AUTHENTICATION = configuration.REMOTE_PROXY_SERVER.AUTHENTICATION || [];
	for(var i = 0; i < configuration.REMOTE_PROXY_SERVER.AUTHENTICATION.length; i = i + 1) {
		configuration.REMOTE_PROXY_SERVER.AUTHENTICATION[i].USERNAME = configuration.REMOTE_PROXY_SERVER.AUTHENTICATION[i].USERNAME || "";
		configuration.REMOTE_PROXY_SERVER.AUTHENTICATION[i].PASSWORD = configuration.REMOTE_PROXY_SERVER.AUTHENTICATION[i].PASSWORD || "";
	}
	configuration.REMOTE_PROXY_SERVER.CERTIFICATE = configuration.REMOTE_PROXY_SERVER.CERTIFICATE || {};
	configuration.REMOTE_PROXY_SERVER.CERTIFICATE.KEY = configuration.REMOTE_PROXY_SERVER.CERTIFICATE.KEY || {};
	configuration.REMOTE_PROXY_SERVER.CERTIFICATE.KEY.FILE = configuration.REMOTE_PROXY_SERVER.CERTIFICATE.KEY.FILE || "";
	configuration.REMOTE_PROXY_SERVER.CERTIFICATE.FILE = configuration.REMOTE_PROXY_SERVER.CERTIFICATE.FILE || "";
	
	return configuration;
}

module.exports.setDefaultConfiguration = setDefaultConfiguration;

var createServer = function(server2, configuration) {
	var websocketServer = new websocket.Server({server: server2});
	
	websocketServer.on("connection", function (connection) {
		console.log("server.connection");
		
		var state = 0;
		var localConnection = null;
		var remoteConnection = null;
		var remoteConnectionState = 0;
		var remoteAddress = "";
		var remotePort = 0;
		
		localConnection = connection;
		
		localConnection.on("message", function(message, flags) {
			console.log("localConnection.message");
			
			if(state == 0) {
				var request = JSON.parse(message);
				
				var authorized = false;
				
				if(configuration["REMOTE_PROXY_SERVER"]["AUTHENTICATION"].length == 0) {
					authorized = true;
				}
				
				if(authorized == false) {
					var i = 0;
					while(i < configuration["REMOTE_PROXY_SERVER"]["AUTHENTICATION"].length) {
						if(configuration["REMOTE_PROXY_SERVER"]["AUTHENTICATION"][i]["USERNAME"] == request["REMOTE_PROXY_SERVER"]["AUTHENTICATION"]["USERNAME"] && configuration["REMOTE_PROXY_SERVER"]["AUTHENTICATION"][i]["PASSWORD"] == request["REMOTE_PROXY_SERVER"]["AUTHENTICATION"]["PASSWORD"]) {
							authorized = true;
							break;
						}
						i = i + 1;
					}
				}
				
				if(authorized == false) {
					localConnection.close();
					
					return;
				}
				
				remoteAddress = request["REMOTE_ADDRESS"];
				remotePort = request["REMOTE_PORT"];
				
				console.log("localConnection.remoteAddress: " + remoteAddress);
				console.log("localConnection.remotePort: " + remotePort);
				
				remoteConnection = net.connect(remotePort, remoteAddress, function() {
					console.log("remoteConnection.connect");
					
					remoteConnectionState = 1;
					
					var response = {};
					response["REMOTE_ADDRESS"] = remoteAddress;
					response["REMOTE_PORT"] = remotePort;
					
					var message = JSON.stringify(response);
					
					if(localConnection.readyState == websocket.OPEN) {
						localConnection.send(message, {binary: false});
					}
					
					state = 1;
					
					return;
				});
				
				remoteConnection.on("data", function(data) {
					console.log("remoteConnection.data");
					
					remoteConnection.pause();
					
					if(localConnection.readyState == websocket.OPEN) {
						localConnection.send(data, {binary: true});
					}
				});
				
				remoteConnection.on("end", function() {
					console.log("remoteConnection.end");
					
					remoteConnectionState = 2;
					
					if(localConnection.readyState == websocket.OPEN) {
						localConnection.close();
					}
				});
				
				remoteConnection.on("close", function(hadError) {
					console.log("remoteConnection.close");
					
					remoteConnectionState = 2;
					
					if(hadError) {
						if(localConnection.readyState == websocket.OPEN) {
							localConnection.terminate();
						}
					} else {
						if(localConnection.readyState == websocket.OPEN) {
							localConnection.close();
						}
					}
				});
				
				remoteConnection.on("error", function(error) {
					console.log("remoteConnection.error");
					console.log("error: " + error.toString());
				});
				
				remoteConnection.on("drain", function() {
					console.log("remoteConnection.drain");
					
					if(localConnection.readyState == websocket.OPEN) {
						localConnection.resume();
					}
				});
				
				return;
			}
			
			if(state == 1) {
				console.log("localConnection.message: messageLength=" + message.length);
				
				if(message.length == 0) {
					if(remoteConnectionState == 1) {
						remoteConnection.resume();
					}
					
					return;
				}
				
				localConnection.send("", {binary: true});
				
				if(remoteConnectionState == 1) {
					if(!remoteConnection.write(message)) {
						localConnection.pause();
					}
				}
				
				return;
			}
		});
		
		localConnection.on("close", function() {
			console.log("localConnection.close");
			
			if(remoteConnectionState == 1) {
				remoteConnection.end();
			}
		});
		
		localConnection.on("error", function(error) {
			console.log("localConnection.error");
			console.log("error: " + error.toString());
		});
	});
	
	return websocketServer;
}

module.exports.createServer = createServer;