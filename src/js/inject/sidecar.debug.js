(function() {
    var Sidecar = window.App;

    /**
     * Adds a method to the `View.Layout` class to get information on the current
     * layout, and its child components.
     * It returns a hierarchical object of the sidecar components on the current
     * page.
     *
     * @return {Object} def The object containing the components of the current
     *   page.
     */
    Sidecar.view.Layout.prototype.getComponentInfo = function() {
        var renderTime = App.debug.getComponentRenderTime(this.cid);
        var path;
        var type = this.type || this.name;
        if (App.metadata.getModule(this.module) &&
            App.metadata.getModule(this.module).layouts &&
            App.metadata.getModule(this.module).layouts[type] &&
            App.metadata.getModule(this.module).layouts[type].path
        ) {
            path = App.metadata.getModule(this.module).layouts[type].path;
        } else {
            path = App.metadata.getStrings('layouts')[type] ?
                App.metadata.getStrings('layouts')[type].path : '';
        }
        var def = {
            cid: this.cid,
            name: this.name,
            type: this.type,
            module: this.module,
            contextId: this.context.cid,
            context: JSON.stringify(this.context),
            compType: 'layout',
            performance: renderTime,
            components: _.map(this._components, function(comp) {
                return comp.getComponentInfo();
            }),
            path: path || ''
        };
        return def;
    }

    /**
     * Adds a method to the `View.View` class to get information on the current
     * view.
     *
     * @return {Object} def The object containing information on the current
     *   view.
     */
    Sidecar.view.View.prototype.getComponentInfo = function() {
        var renderTime = App.debug.getComponentRenderTime(this.cid);
        var path;
        var type = this.type || this.name;
        if (App.metadata.getModule(this.module) &&
            App.metadata.getModule(this.module).views &&
            App.metadata.getModule(this.module).views[type] &&
            App.metadata.getModule(this.module).views[type].path
        ) {
            path = App.metadata.getModule(this.module).views[type].path;
        } else {
            path = App.metadata.getStrings('views')[type] ?
                App.metadata.getStrings('views')[type].path : '';
        }
        var def = {
            cid: this.cid,
            contextId: this.context.cid,
            context: JSON.stringify(this.context),
            name: this.name,
            type: this.type,
            compType: 'view',
            performance: renderTime,
            module: this.module,
            compType: 'view',
            path: path || ''
        };
        return def;
    }

    Sidecar.view.Layout.prototype.setRenderTime =
    Sidecar.view.View.prototype.setRenderTime = function(time, operation) {
        if (!time) {
            return;
        }
        switch (operation) {
            case 'add':
                this.performance += time;
                break;
            case 'subtract':
                this.performance -= time;
                break;
            default:
                this.performance = time;
        }
        if (this.layout) {
            this.layout.setRenderTime(time, operation);
        }
    };

    Sidecar.Debug = (function() {

        var _components = {};
        var renderTimes;
        var _stream = {};

        function Debug() {
            //Sidecar.app.on('app:sync', this._onSyncStart, this);
            //Sidecar.app.on('app:sync:complete', this._onSyncComplete, this);
            Sidecar.events.trigger = _.wrap(Sidecar.events.trigger, function(trigger) {
                var args = Array.prototype.slice.call(arguments, 1);
                Sidecar.debug.AppStream.add(
                    {
                        'event': args[0],
                        'operation': args[1] || '',
                        'type': 'app.event',
                        args: _.clone(args)
                    }
                );
                var result = trigger.apply(Sidecar.events, args);
                return result;
            });
            this._hookPrototype('Controller', 'loadView', this._onHookControllerLoadView, true);
            this._hookPrototype('view.Field', 'initialize', this._onHookFieldInitialize, true);
            this._hookPrototype('view.Field', 'render', this._onHookFieldRender, true, true);
            this._hookPrototype('view.View', 'initialize', this._onHookViewInitialize, true);
            this._hookPrototype('view.View', 'render', this._onHookViewRender, true);
            this._hookPrototype('view.Layout', 'initialize', this._onHookLayoutInitialize, true);
            this._hookPrototype('view.Layout', 'render', this._onHookLayoutRender, true);
            this._hookPrototype('view.Component', 'dispose', this._removeField);
            this._hookPrototype('view.Component', 'trigger', this._onHookComponentTrigger, true);
        };

        /**
         * Helper method to hook a method of a given sidecar component.
         */
        Debug.prototype._hookPrototype = function(objectName, method, action, performance) {
            var elems = objectName.split('.');
            var object = Sidecar;
            try {
                elems.every(function(elem) {
                    object = object[elem];
                    if (_.isUndefined(object)) {
                        throw "Wrong name."
                        return false;
                    }
                    return true;
                });
            } catch(err) {
                console.log('The component you\'re trying to hook doesn\'t exist.');
                return;
            }

            var original;
            original = object.prototype[method];
            return object.prototype[method] = function() {
                var ret;
                var start = performance && window.performance.now();
                var args = Array.prototype.slice.call(arguments, 0);
                ret = original.apply(this, args);
                if (performance) {
                    var end = window.performance.now();
                    args.push(Math.round((end-start) * 10 ) / 10);
                    action.apply(this, args);
                } else {
                    action.apply(this, args);
                }
                return ret;
            };
        };

        Debug.prototype._onHookLayoutInitialize = function(options, performance) {
            this.$el.attr('data-debug-cid', this.cid);
            this.debugType = 'layout';
            _components[this.cid] = this;
            Sidecar.debug.AppStream.add({
                'type': 'layout.initialize',
                instance: this,
                performance: Array.prototype.slice.call(arguments, -1).pop(),
                'layout': {
                    name: this.name,
                    type: this.type
                },
                'args': options
            });
        };

        Debug.prototype._onHookViewInitialize = function(options, performance) {
            this.$el.attr('data-debug-cid', this.cid);
            this.debugType = 'view';
            _components[this.cid] = this;
            Sidecar.debug.AppStream.add({
                'type': 'view.initialize',
                instance: this,
                performance: Array.prototype.slice.call(arguments, -1).pop(),
                'view': {
                    name: this.name
                },
                'args': options
            });
        };

        Debug.prototype._onHookFieldInitialize = function(options, performance) {
            this.$el.attr('data-debug-cid', this.cid);
            this.debugType = 'field';
            _components[this.cid] = this;
            Sidecar.debug.AppStream.add({
                'type': 'field.initialize',
                instance: this,
                performance: Array.prototype.slice.call(arguments, -1).pop(),
                'field': {
                    name: this.name,
                    type: this.type
                },
                'args': options
            });
        };

        Debug.prototype._onHookLayoutRender = function() {
            var performance = Array.prototype.slice.call(arguments, -1).pop();
            var lastRenderTime = _components[this.cid].performance;
            this.layout && this.layout.setRenderTime(lastRenderTime, 'subtract');
            _components[this.cid].performance = performance;
            this.layout && this.layout.setRenderTime(performance, 'add');

            Sidecar.debug.AppStream.add({
                'type': 'layout.render',
                instance: this,
                performance: performance,
                'layout': {
                    name: this.name,
                    type: this.type,
                    tplName: this.tplName
                }
            });
        };

        Debug.prototype._onHookViewRender = function() {
            var performance = Array.prototype.slice.call(arguments, -1).pop();
            var lastRenderTime = _components[this.cid].performance;
            this.layout.setRenderTime(lastRenderTime, 'subtract');
            _components[this.cid].performance = performance;
            this.layout.setRenderTime(performance, 'add');
            Sidecar.debug.AppStream.add({
                'type': 'view.render',
                instance: this,
                performance: performance,
                'view': {
                    name: this.name,
                    type: this.type,
                    tplName: this.tplName,
                    action: this.action
                }
            });

            if(window.sessionStorage['_backbone_debug_tooltips'] === 'enabled') {
                // add view info widget
                var tooltip_html = '<h5>' + this.cid + '</h5>';

                tooltip_html += '<ul class="unstyled">';
                tooltip_html += '<li>Name: ' + this.name + '</li>';
                tooltip_html += '<li>Action: ' + this.action + '</li>';
                tooltip_html += '<li>Module: ' + this.module + '</li>';
                tooltip_html += '</ul>';

                var $parent = $('div[data-debug-cid=' + this.layout.cid + ']');

                createTooltip(this.$el, $parent, tooltip_html);
            }
        };

        Debug.prototype._onHookFieldRender = function(performance) {
            this.$el.attr('data-debug-cid', this.cid);
            Sidecar.debug.AppStream.add({
                'type': 'field.render',
                instance: this,
                performance: Array.prototype.slice.call(arguments, -1).pop(),
                'field': {
                    name: this.name,
                    type: this.type,
                    tplName: this.tplName,
                    action: this.action
                }
            });

            if(window.sessionStorage['_backbone_debug_tooltips'] === 'enabled') {
                // add field info widget
                var tooltip_html = '<h5>' + this.cid + '</h5>';

                tooltip_html += '<ul class="unstyled">';

                var attributes = _.pick(this.def, 'name', 'type');

                // filter relevant attributes from different field types
                switch (this.type) {
                    default:
                        break;
                    case 'relate':
                        attributes = _.extend(attributes, _.pick(this.def, 'link', 'id_name', 'module'),
                            {'link_record': this.model.get(this.def.id_name)});
                        break;
                    case 'currency':
                        // show currencies in a
                        var currencyId = this.model.get('currency_id') || -99;
                        attributes = _.extend(attributes, {
                            currency: App.metadata.getCurrency(currencyId).iso4217 + ' (' + currencyId + ')',
                            base_rate: this.model.get('base_rate') || 1.0
                        });
                        break;
                    case 'enum':
                        attributes = _.extend(attributes, _.pick(this.def, 'options', 'isMultiSelect'));
                        break;
                }
                _.each(attributes, function (value, key) {
                    tooltip_html += '<li>' + key + ': ' + value + '</li>';
                });

                tooltip_html += '<li>Module: ' + this.module + '</li>';

                tooltip_html += '<li>Model: ' + ( (_.isUndefined(this.model.id)) ? 'none' : this.model.module + '/' + this.model.id) + '</li>';

                tooltip_html += '</ul>';

                var $el = this.$el;

                // workaround for mouse opacity on inline edit wrapper
                // uses the record cell instead of the actual field
                if(this.view && this.view.name == 'record') {
                    //$el = this.$el.closest('div[data-name="' + this.name + '"], span[data-name="' + this.name + '"]');
                    $el = this.$el.closest('[data-name="' + this.name + '"]');
                }

                var $parent = $('div[data-debug-cid=' + this.view.cid + ']');

                createTooltip($el, $parent, tooltip_html);
            }
        };

        Debug.prototype._onHookComponentTrigger = function() {
            var args = Array.prototype.slice.call(arguments, 0);
            var activity = {
                instance: this,
                'type': this.debugType + '.trigger',
                performance: args.pop(),
                args: args,
                event: args[0]
            };
            activity[this.debugType] = {
                name: this.name,
                type: this.type
            };
            Sidecar.debug.AppStream.add(activity);
        };

        Debug.prototype._onHookControllerLoadView = function(params, performance) {
            Sidecar.debug.AppStream.add({
                instance: this,
                'layout': params.layout,
                'module': params.module,
                'type': 'controller',
                performance: Array.prototype.slice.call(arguments, -1).pop(),
                'args': params
            });
        };

        Debug.prototype._removeField = function() {
            delete _components[this.cid];
        };

        Debug.prototype.getComponent = function(cid) {
            return _components[cid];
        };

        /**
         * Gets the renderTime of a component given its cid.
         *
         * @param {string} cid The component's cid.
         * @return {number} The time that the component took to render.
         */
        Debug.prototype.getComponentRenderTime = function(cid) {
            return _components[cid].performance;
        };

        /**
         * Creates a custom Bootstrap tooltip for displaying component info.
         * @param $el The tooltip target as a jQuery object
         * @param $parent The parent of $el as a jQuery object
         * @param html
         */
        function createTooltip($el, $parent, html) {
            $el.tooltip({
                html: true,
                title: html,
                template: '<div class="tooltip sdt-tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>',
                container: '#sugarcrm',
                sdt: true,
                placement: function(tip, element) {
                    var position = $(element).position(),
                        offset = $(element).offset(),
                        placement = 'auto top';

                    if(position.left > ($parent.width() / 2)) {
                        placement = 'left';
                    }

                    if(position.top < ($parent.height() / 2)) {
                        placement = 'bottom';
                    }

                    return placement;
                }
            }).on("show.bs.tooltip", function(e) {
                if(_.isUndefined($(this).data('bs.tooltip').options.sdt)) {
                    return;
                }
                $('.tooltip').not(this).hide();
            });
        }

        function formatDate(date) {
            var hours = date.getHours();
            var minutes = date.getMinutes();
            var seconds = date.getSeconds();
            var ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            minutes = minutes < 10 ? '0'+minutes : minutes;
            seconds = seconds < 10 ? '0'+seconds : seconds;
            var strTime = hours + ':' + minutes + ':' + seconds;
            return strTime;
            return date.getMonth()+1 + "/" + date.getDate() + "/" + date.getFullYear() + "  " + strTime;
        }

        var Activity = Backbone.Model.extend({
            initialize: function(attributes) {
                var now = new Date();
                this.set('_createdAt', now.getTime(), {silent: true});
                this.set('id', this.cid);
                this.createdAt = formatDate(now);
            },

            toJSON: function(number) {
                var orig = Backbone.Model.prototype.toJSON.call(this);
                orig.createdAt = this.createdAt;
                orig.args = !!orig.args;
                orig.instance = !!orig.instance;
                return orig;
            }
        });

        var ActivityStream = Backbone.Collection.extend({
            model: Activity,

            getAll: function() {
                return this.models;
            }
        });

        Debug.prototype.AppStream = new ActivityStream();
        return Debug;

    })();

    Sidecar.debug = new Sidecar.Debug();

}).call(this);
