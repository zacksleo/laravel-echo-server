"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var request = require('request');
var presence_channel_1 = require("./presence-channel");
var private_channel_1 = require("./private-channel");
var log_1 = require("./../log");
var Channel = (function () {
    function Channel(io, options) {
        this.io = io;
        this.options = options;
        this._privateChannels = ['private-*', 'presence-*'];
        this._clientEvents = ['client-*'];
        this.private = new private_channel_1.PrivateChannel(options);
        this.presence = new presence_channel_1.PresenceChannel(io, options);
        this.request = request;
        if (this.options.devMode) {
            log_1.Log.success('Channels are ready.');
        }
    }
    Channel.prototype.join = function (socket, data) {
        if (data.channel) {
            if (this.isPrivate(data.channel)) {
                this.joinPrivate(socket, data);
            }
            else {
                socket.join(data.channel);
                this.onJoin(socket, data.channel, data.auth);
            }
        }
    };
    Channel.prototype.clientEvent = function (socket, data) {
        if (data.event && data.channel) {
            if (this.isClientEvent(data.event) &&
                this.isPrivate(data.channel) &&
                this.isInChannel(socket, data.channel)) {
                this.io.sockets.connected[socket.id]
                    .broadcast.to(data.channel)
                    .emit(data.event, data.channel, data.data);
                this.hook(socket, data.channel, data.auth, "client_event", data.data);
            }
        }
    };
    Channel.prototype.leave = function (socket, channel, reason, auth) {
        if (channel) {
            if (this.isPresence(channel)) {
                this.presence.leave(socket, channel);
            }
            socket.leave(channel);
            if (this.options.devMode) {
                log_1.Log.info("[" + new Date().toLocaleTimeString() + "] - " + socket.id + " left channel: " + channel + " (" + reason + ")");
            }
            this.hook(socket, channel, auth, "leave", null);
        }
    };
    Channel.prototype.isPrivate = function (channel) {
        var isPrivate = false;
        this._privateChannels.forEach(function (privateChannel) {
            var regex = new RegExp(privateChannel.replace('\*', '.*'));
            if (regex.test(channel))
                isPrivate = true;
        });
        return isPrivate;
    };
    Channel.prototype.joinPrivate = function (socket, data) {
        var _this = this;
        this.private.authenticate(socket, data).then(function (res) {
            socket.join(data.channel);
            if (_this.isPresence(data.channel)) {
                var member = res.channel_data;
                try {
                    member = JSON.parse(res.channel_data);
                }
                catch (e) { }
                _this.presence.join(socket, data.channel, member);
            }
            _this.onJoin(socket, data.channel, data.auth);
        }, function (error) {
            if (_this.options.devMode) {
                log_1.Log.error(error.reason);
            }
            _this.io.sockets.to(socket.id)
                .emit('subscription_error', data.channel, error.status);
        });
    };
    Channel.prototype.isPresence = function (channel) {
        return channel.lastIndexOf('presence-', 0) === 0;
    };
    Channel.prototype.onJoin = function (socket, channel, auth) {
        if (this.options.devMode) {
            log_1.Log.info("[" + new Date().toLocaleTimeString() + "] - " + socket.id + " joined channel: " + channel);
        }
        this.hook(socket, channel, auth, "join", null);
    };
    Channel.prototype.isClientEvent = function (event) {
        var isClientEvent = false;
        this._clientEvents.forEach(function (clientEvent) {
            var regex = new RegExp(clientEvent.replace('\*', '.*'));
            if (regex.test(event))
                isClientEvent = true;
        });
        return isClientEvent;
    };
    Channel.prototype.isInChannel = function (socket, channel) {
        return !!socket.rooms[channel];
    };
    Channel.prototype.hook = function (socket, channel, auth, event, payload) {
        var _this = this;
        if (typeof this.options.hookEndpoint == 'undefined' ||
            !this.options.hookEndpoint) {
            return;
        }
        var hookEndpoint = this.options.hookEndpoint;
        var options = this.prepareHookHeaders(socket, auth, channel, hookEndpoint, event, payload);
        this.request.post(options, function (error, response, body, next) {
            if (error) {
                if (_this.options.devMode) {
                    log_1.Log.error("[" + new Date().toLocaleTimeString() + "] - Error call " + event + " hook " + socket.id + " for " + options.form.channel_name);
                }
                log_1.Log.error(error);
            }
            else if (response.statusCode !== 200) {
                if (_this.options.devMode) {
                    log_1.Log.warning("[" + new Date().toLocaleTimeString() + "] - Error call " + event + " hook " + socket.id + " for " + options.form.channel_name);
                    log_1.Log.error(response.body);
                }
            }
            else {
                if (_this.options.devMode) {
                    log_1.Log.info("[" + new Date().toLocaleTimeString() + "] - Call " + event + " hook for " + socket.id + " for " + options.form.channel_name + ": " + response.body);
                }
            }
        });
    };
    Channel.prototype.prepareHookHeaders = function (socket, auth, channel, hookEndpoint, event, payload) {
        var hookHost = this.options.hookHost ? this.options.hookHost : this.options.authHost;
        var options = {
            url: hookHost + hookEndpoint,
            form: {
                event: event,
                channel: channel,
                payload: payload
            },
            headers: (auth && auth.headers) ? auth.headers : {}
        };
        options.headers['Cookie'] = socket.request.headers.cookie;
        options.headers['X-Requested-With'] = 'XMLHttpRequest';
        return options;
    };
    return Channel;
}());
exports.Channel = Channel;
