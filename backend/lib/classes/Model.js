var injector    = require( 'injector' )
  , Class       = injector.getInstance( 'Class' )
  , Exceptions  = require( 'exceptions' )
  , Promise     = require( 'bluebird' )
  , path        = require( 'path' )
  , async       = require( 'async' )
  , util        = require( 'util' )
  , validator   = require( 'utils' ).modelValidator
  , debuggr     = require( 'debug' )( 'Models' )
  , inflect     = require( 'i' )()
  , _           = require( 'underscore' )
  , moduleLdr   = injector.getInstance( 'moduleLoader' )
  , models      = {};

var Model = Class.extend(
/* @Static */
{   
    /**
     * Defines if this model will be powered by the 'ORM' or 'ODM' modules. (clever-orm and clever-odm respectively)
     * @type {String}
     */
    type: 'ORM',

    /**
     * If set to a String this will be the tableName (ORM) or collectionName (ODM).
     * @type {Boolean|String}
     */
    dbName: false,

    /**
     * By default table (ORM) and collection (ODM) names are pluralized, if you don't want this behaviour set freezeDbName to "true"
     * @type {Boolean}
     */
    freezeDbName: false,

    /**
     * If you want your field names to be underscored instead of camelCased set this option to "true"
     * @type {Boolean}
     */
    underscored: false,

    /**
     * ORM ONLY: Allows you to set the mysql engine to use on the table that is created for this model (example: MyISAM)
     * @type {Boolean|String}
     */
    engine: false,

    /**
     * ORM ONLY: Allows you to set the charset for the table that will be created for this model
     * @type {Boolean|String}
     */
    charset: false,

    /**
     * ORM ONLY: Allows you to set a comment to be added to the SQL Table
     * @type {Boolean}
     */
    comment: false,

    /**
     * ORM ONLY: Allows you to set the collate option for the table created for this model
     * @type {Boolean}
     */
    collate: false,
    
    /**
     * The "softDeleteable" behaviour, no records will ever be deleted from the database
     * but rather the column "deletedAt" (or the value of Model.deleteAt as the column name) will be NULL for records
     * that have not been deleted and will be the Date & Time of when they were deleted for deleted records.
     * @type {Boolean}
     */
    softDeleteable: false,

    /**
     * Allows you to override the column name of the softDeleteable behaviour, default is "deletedAt"
     * @type {String}
     */
    deletedAt: 'deletedAt',

    /**
     * The "timeStampable" behaviour, this means that when a record is created it will
     * have a datetime stored in the "createdAt" column and when updated will have a datetime stored in updatedAt.
     * 
     * You can override the column names of createdAt and updatedAt by setting Model.createdAt or Model.deletedAt
     * when using the Model.extend() method
     * @type {Boolean}
     */
    timeStampable: true,

    /**
     * Allows you to override the column name of the "timeStampable" behaviours createdAt field
     * @type {String}
     */
    createdAt: 'createdAt',

    /**
     * Allows you to override the column name of the "timeStampable" behaviours updatedAt field
     * @type {String}
     */
    updatedAt: 'updatedAt',


    // Get the model cache
    getDefinedModels: function() {
        return models;
    },

    // Behaviours that have not been implemented yet!
    versionable: false,
    sluggable: false,
    translateable: false,
    blameable: false,
    searchable: false,
    loggable: false,
    nestable: false,

    Types: {
        ENUM: function() {
            return {
                type: this.ENUM,
                values: [].slice.call( arguments ),
                toString: function() {
                    return this.type;
                }
            }
        },
        BIGINT: function( length ) {
            return {
                type: this.BIGINT,
                length: length,
                toString: function() {
                    return this.type;
                }
            }
        },
        FLOAT: function( length, decimals ) {
            var field = {
                type: this.FLOAT,
                length: length,
                toString: function() {
                    return this.type;
                }
            }

            if ( decimals !== undefined ) {
                field.decimals = decimals;
            }

            return field;
        },
        DECIMAL: function( precision, scale ) {
            var field = {
                type: this.DECIMAL,
                precision: precision,
                toString: function() {
                    return this.type;
                }
            }

            if ( scale !== undefined ) {
                field.scale = scale;
            }

            return field;
        },
        TEXT: function() {
            return {
                type: this.TEXT,
                toString: function() {
                    return this.type;
                }
            }
        }
    },

    _validator: validator,

    // The function you call to create a new model
    extend: function() {
        var extendingArgs = [].slice.call( arguments )
          , modelName = ( typeof extendingArgs[ 0 ] === 'string' ) ? extendingArgs.shift() : false
          , Static = ( extendingArgs.length === 2 ) ? extendingArgs.shift() : {}
          , Proto = extendingArgs.shift()
          , modelType = Static.type !== undefined ? Static.type : this.type
          , moduleName = 'clever-' + modelType.toLowerCase()
          , driver = null
          , model = null
          , debug = null;

        extendingArgs = [ Static, Proto ];

        if ( !modelName ) {

            var Reg = new RegExp( '.*\\(([^\\)]+)\\:.*\\:.*\\)', 'ig' )
              , stack = new Error().stack.split( '\n' )
              , file = stack.splice( 2, 1 );

            if ( Reg.test( file ) ) {
                modelName = RegExp.$1.split( path.sep ).pop().replace( '.js', '' );
            } else {
                throw new Error( 'Unable to determine model name.' );
            }
        }

        debug = function( msg ) {
            debuggr( modelName + 'Model: ' + msg );
        };

        if ( models[ modelName ] !== undefined ) {
            debuggr( modelName + 'Model: Returning model class from the cache...' );
            return models[ modelName ];
        }

        debuggr( [ modelName + 'Model: Defining model using', modelType, 'type...' ].join( ' ' ) );

        Static._name = modelName;
        Static.type = modelType;

        debuggr( modelName + 'Model: Checking to see if the driver is installed and enabled...' );
        if ( moduleLdr.moduleIsEnabled( moduleName ) !== true ) {
            throw new Error( [ 'To use type', modelType, 'on your', modelName, 'model you need to enable the', moduleName, 'module!' ].join( ' ' ) );
        } else {
            Static._driver = driver = injector.getInstance( modelType.toLowerCase() === 'orm' ? 'cleverOrm' : 'cleverOdm' );
        }

        debug( 'Checking for defined getters and setters...' );

        if ( Proto.getters !== undefined ) {
            Static._getters = Proto.getters;
            delete Proto.getters;
        }

        if ( Proto.setters !== undefined ) {
            Static._setters = Proto.setters;
            delete Proto.setters;
        }

        debug( 'Defining schema...' );
        Object.keys( Proto ).forEach( this.callback( 'getSchemaFromProto', Proto, Static ) );

        debug( 'Defining models this.debug() helper...' );
        Proto.debug = Static.debug = function( msg ) {
            driver.debug( modelName + 'Model: ' + msg );
        };

        debug( 'Setting up options and behaviours...' );
        [ 
            'dbName', 'freezeDbName', 'underscored', 'engine', 'charset', 'comment', 'collate',
            'softDeleteable', 'deletedAt', 'versionable', 'timeStampable', 'createdAt', 'updatedAt' 
        ].forEach(function( behaviour ) {

            Static[ behaviour ] = Static[ behaviour ] !== undefined ? Static[ behaviour ] : this[ behaviour ];

        }.bind( this ));

        // Add the accessedAt field if we are timeStampable
        if ( Static.timeStampable === true ) {
            debug( 'Defining timeStampable behaviour schema fields...' );

            Static._schema[ this.createdAt ] = Date;
            Static._schema[ this.updatedAt ] = Date;
        }

        // Add the deletedAt field if we are softDeleteable
        if ( !!Static.softDeleteable ) {
            debug( 'Defining softDeleteable behaviour schema fields...' );

            if ( modelType.toLowerCase() === 'odm' ) {
                Static._schema[ this.deletedAt ] = {
                    type: Date,
                    default: null
                };
            }
        }

        debug( 'Generating native model using driver.parseModelSchema()...' );
        Static._model = driver.parseModelSchema( Static, Proto );

        debug( 'Creating model class...' );
        model = this._super.apply( this, extendingArgs );

        models[ modelName ] = model;
        return model;
    },

    // Private function used to build _schema so it can be passed to the _driver for schema creation
    getSchemaFromProto: function( Proto, Static, key ) {
        var prop = Proto[ key ];
        
        if ( typeof prop === 'function' && [ String, Number, Boolean, Date, Buffer, Model.Types.ENUM, Model.Types.BIGINT, Model.Types.FLOAT, Model.Types.DECIMAL, Model.Types.TEXT ].indexOf( Proto[ key ] ) === -1 && key !== 'defaults') {

        } else if ( key !== 'defaults' ) {

            if ( typeof Static._schema !== 'object' ) {
                Static._schema = {};
            }

            if ( typeof Static._getters !== 'object' ) {
                Static._getters = {};
            }

            if ( typeof Static._setters !== 'object' ) {
                Static._setters = {};
            }

            Static._schema[ key ] = prop;
            Static._getters[ key ] = function() {
                if ( key === 'id' && Static.type.toLowerCase() === 'odm' ) {
                    return this._model._id;
                } else {
                    return this._model[ key ];
                }
            };
            Static._setters[ key ] = function( val ) {
                this._model[ key ] = val;
            };

            delete Proto[ key ];
        }
    },

    // @TODO refactor this id / idOrWhere bullshit (findOptions...)
    find: function( id, options ) {
        var modelType = this.type.toUpperCase ? this.type.toUpperCase() : this.type
          , isModel = !!this._model && this._model !== null
          , that = this
          , findOptions = !/^[0-9a-fA-F]{24}$/.test( id ) && isNaN( id ) ? id : { where: {} };

        options = options || {};

        return new Promise(function( resolve, reject ) {

            // Configure findOptions
            if ( !!id && ( /^[0-9a-fA-F]{24}$/.test( id ) || !isNaN( id ) ) ) {
                if ( modelType === 'ODM' ) {
                    try {
                        findOptions.where._id = that._driver.mongoose.Types.ObjectId.fromString( id );
                    } catch( err ) {
                        resolve( null );
                        return;
                    }
                } else {
                    findOptions.where.id = id;
                }
            }

            // Make sure we have either an id or findOptions to find by models with
            if ( !!isModel && !id && !findOptions ) {
                return reject( new Exceptions.InvalidData( [ 'You must specify either an id or an object containing fields to find a', that._name ].join( ' ' ) ) );
            }

            async.waterfall(
                [
                    function validateModel( callback ) {
                        callback( !!isModel ? null : 'You cannot call Model.find() directly on the model class.' );
                    },

                    function softDeleteable( callback ) {
                        if ( !!that.softDeleteable ) {
                            findOptions[ that.deletedAt ] = null;
                        }
                        callback( null );
                    },

                    function emit( callback ) {
                        that.emit( 'preQuery', findOptions );
                        callback( null );
                    },

                    function findModel( callback ) {
                        that.debug( 'find()' );

                        if ( modelType === 'ORM' ) {

                            if ( !!findOptions.include && findOptions.include instanceof Array ) {
                                for( var i = 0; i < findOptions.include.length; i++ ) {
                                    if ( findOptions.include[ i ]._model ) {
                                        findOptions.include[ i ] = findOptions.include[ i ]._model;
                                    } else if ( findOptions.include[ i ].model && findOptions.include[ i ].model._model ) {
                                        findOptions.include[ i ].model = findOptions.include[ i ].model._model;
                                    }
                                }
                            }

                            that._model
                                .find( findOptions, options )
                                .then( that.callback( callback, null ) )
                                .catch( callback );

                        } else if ( modelType === 'ODM' ) {

                            that._model.findOne( findOptions, callback );

                        } else {

                            callback( 'Unsupported Model Type(' + modelType + ')' );
                            
                        }
                    }
                ],
                function returnFoundModel( err, _model ) {
                    if ( !err ) {
                        var model = !!_model && _model !== null ? new that( _model ) : null;

                        if ( modelType === 'ORM' ) {

                            if ( model !== null && findOptions.include && findOptions.include.length && model._model.options.include ) {
                                Object.keys( model._model.options.includeMap ).forEach( function( modelName ) {
                                    var _include    = model._model.options.includeMap[ modelName ]
                                      , as          = inflect.camelize( _include.as, false )
                                      , csModel     = models[ modelName ];

                                    if ( !!csModel && !!model._model[ as ] ) {
                                        if ( model._model[ as ] instanceof Array ) {
                                            for ( var i = 0; i < model._model[ as ].length; i++ ) {
                                                if ( !( model._model[ as ][ i ] instanceof csModel ) ) {
                                                    model._model[ as ][ i ] = new csModel( model._model[ as ][ i ] );
                                                }
                                            }
                                        } else {
                                            if ( !( model._model[ as ] instanceof csModel ) ) {
                                                model._model[ as ] = new csModel( model._model[ as ] );
                                            }
                                        }
                                    }
                                });
                            }
                            resolve( model );
                        } else if ( modelType === 'ODM' ) {
                            resolve( model );
                        }
                    } else {
                        reject( [ 'Unable to find the', that._name, 'model because of', err ].join( ' ' ) );
                    }
                }
            );
        });
    },

    findById: function( id, options ) {
        return this.find( id, options );
    },

    findOne: function( id, options ) {
        return this.find( id, options );
    },

    findOrCreate: function( idOrWhere, data, options ) {
        var that = this;

        return new Promise( function( resolve, reject ) {
            that
            .find( idOrWhere, options )
            .then( function( model ) {
                if ( model === null ) {
                    that.create( data, options )
                        .then( resolve )
                        .catch( reject );
                } else {
                    resolve( model );
                }
            })
            .catch( function( err ) {
                reject( err instanceof Error ? err : new Error( err ) );
            });
        });
    },

    findAndUpdate: function( idOrWhere, data, options ) {
        var that = this;

        return new Promise( function( resolve, reject ) {
            that
            .find( idOrWhere, options )
            .then( function( model ) {
                return model.update( data, options ).then( resolve );
            })
            .catch( reject );
        });
    },

    findAll: function( findOptions, options ) {
        var modelType = this.type.toUpperCase ? this.type.toUpperCase() : this.type
          , isModel = !!this._model && this._model !== null
          , that = this;

        findOptions = typeof findOptions === 'object' ? findOptions : { where: findOptions };
        options     = options || {};

        return new Promise(function( resolve, reject ) {
            async.waterfall(
                [
                    function validateModel( callback ) {
                        callback( !!isModel ? null : 'You cannot call Model.findAll() directly on the model class.' );
                    },

                    function softDeleteable( callback ) {
                        if ( !!that.softDeleteable ) {
                            findOptions[ that.deletedAt ] = null;
                        }
                        callback( null );
                    },

                    function emit( callback ) {
                        that.emit( 'preQuery', findOptions );
                        callback( null );
                    },

                    function findModels( callback ) {
                        that.debug( 'findAll()' );

                        if ( modelType === 'ORM' ) {

                            if ( !!findOptions.include && findOptions.include instanceof Array ) {
                                for( var i = 0; i < findOptions.include.length; i++ ) {
                                    if ( findOptions.include[ i ]._model ) {
                                        findOptions.include[ i ] = findOptions.include[ i ]._model;
                                    } else if ( findOptions.include[ i ].model && findOptions.include[ i ].model._model ) {
                                        findOptions.include[ i ].model = findOptions.include[ i ].model._model;
                                    }
                                }
                            }

                            that._model
                                .findAll( findOptions, options )
                                .then( that.callback( callback, null ) )
                                .catch( callback );

                        } else if ( modelType === 'ODM' ) {

                            that._model.find( findOptions, callback );

                        } else {

                            callback( 'Unsupported Model Type(' + modelType + ')' );
                            
                        }
                    }
                ],
                function returnFoundModels( err, _models ) {
                    var models = [];
                    
                    _models = _models instanceof Array ? _models : [ _models ];

                    if ( !err ) {
                        _models.forEach(function( model ) {
                            if ( model !== null ) {
                                model = new that( model );

                                if ( modelType === 'ORM' ) {

                                    if ( findOptions.include && findOptions.include.length && model._model.options.include ) {
                                        Object.keys( model._model.options.includeMap ).forEach( function( modelName ) {
                                            var _include    = model._model.options.includeMap[ modelName ]
                                              , as          = inflect.camelize( _include.as, false )
                                              , csModel     = models[ modelName ];

                                            if ( !!csModel && !!model._model[ as ] ) {
                                                if ( model._model[ as ] instanceof Array ) {
                                                    for ( var i = 0; i < model._model[ as ].length; i++ ) {
                                                        if ( !( model._model[ as ][ i ] instanceof csModel ) ) {
                                                            model._model[ as ][ i ] = new csModel( model._model[ as ][ i ] );
                                                        }
                                                    }
                                                } else {
                                                    if ( !( model._model[ as ] instanceof csModel ) ) {
                                                        model._model[ as ] = new csModel( model._model[ as ] );
                                                    }
                                                }
                                            }
                                        });
                                    }
                                }
                                models.push( model );
                            }
                        });

                        resolve( models );
                    } else {
                        reject( [ 'Unable to find any', that._name, 'models because of', err, err ? err.stack : 'without a stack trace' ].join( ' ' ) );
                    }
                }
            );
        });
    },

    // @TODO - implement include here, maybe it provides an easy nested way of creating, updating and deleting models
    create: function( data, options ) {
        var modelType = this.type.toUpperCase ? this.type.toUpperCase() : this.type
          , isModel = !!this._model && this._model !== null
          , that = this;

        options = options || {};

        return new Promise(function( resolve, reject ) {
            async.waterfall(
                [
                    function validateModel( callback ) {
                        callback( !!isModel ? null : 'You cannot call Model.create() directly on the model class.' );
                    },

                    function hasValidData( callback ) {
                        if ( !!data && !data.id && Object.keys( data ).length ) {
                            callback( null );
                        } else {
                            reject( new Exceptions.InvalidData( 'Invalid data provided to Model.create(' + util.inspect( data ) + ')' ) );
                        }
                    },

                    function validateValues( callback ) {
                        that.debug( 'validate()' );

                        validator.validate( that, data )
                            .then( callback )
                            .catch( function( err ) {
                                callback( new Exceptions.ModelValidation( err ) );
                            });
                    },

                    function timeStampable( callback ) {
                        if ( modelType === 'ODM' && !!that.timeStampable ) {
                            data[ that.createdAt ] = Date.now();
                            data[ that.updatedAt ] = Date.now();
                        }
                        callback( null );
                    },
                    
                    function createModel( callback ) {
                        that.debug( 'create()' );

                        if ( modelType === 'ORM' ) {

                            that._model
                                .create( data, options )
                                .then( that.callback( callback, null ) )
                                .catch( callback )

                        } else if ( modelType === 'ODM' ) {
                            
                            that._model.create( data, callback );

                        } else {

                            callback( 'Unsupported Model Type(' + modelType + ')' );

                        }
                    }
                ],
                function returnCreatedModel( err, _model ) {
                    if ( !err ) {
                        resolve( new that( _model instanceof Array ? _model[ 0 ] : _model ) );
                    } else {
                        reject( err );
                    }
                }
            );
        });
    },

    hasMany: function() {
        return this._model.hasMany.apply( this._model, arguments );
    },

    hasOne: function() {
        return this._model.hasOne.apply( this._model, arguments );
    },

    belongsTo: function() {
        return this._model.belongsTo.apply( this._model, arguments );
    }
},
/* @Prototype */
{
    _model: null,

    setup: function( model ) {
        this._setModel( model );
        Object.keys( this.Class._getters ).forEach( this.proxy( '_setupProperty' ) );

        if ( this.Class.timeStampable ) {
            Object.defineProperty( this, this.Class.createdAt, {
                get: function() { return this._model.createdAt },
                set: function( val ) { this._model.createdAt = val; },
                enumerable: true
            });
            Object.defineProperty( this, this.Class.updatedAt, {
                get: function() { return this._model.updatedAt },
                set: function( val ) { this._model.updatedAt = val; },
                enumerable: true
            });
        }

        if ( this.Class.softDeleteable ) {
            this._setupProperty( this.Class.softDeleteable );
            Object.defineProperty( this, this.Class.deletedAt, {
                get: function() { return this._model.deletedAt },
                set: function( val ) { this._model.deletedAt = val; },
                enumerable: true
            });
        }
    },

    _setupProperty: function( propName ) {
        Object.defineProperty( this, propName, {
            get: this.proxy( this.Class._getters[ propName ] ),
            set: this.proxy( this.Class._setters[ propName ] ),
            enumerable: true
        });
    },

    _setModel: function( _model ) {
        this._model = _model;
    },

    map: function() {
        return this._model.map.apply( this, arguments );
    },

    // @TODO handle all 3 available sequelizejs arguments in save()
    save: function( options ) {
        var that = this;

        this.debug( 'save(' + JSON.stringify( this ) + ')' );

        options = options || {};

        return new Promise( function( resolve, reject ) {
            async.waterfall(
                [
                    function validateValues( callback ) {
                        validator.validate( that )
                            .then( callback )
                            .catch( function( err ) {
                                callback( new Exceptions.ModelValidation( err ) );
                            });
                    },

                    function saveModel( callback ) {
                        if ( that.Class.type.toLowerCase() === 'orm' ) {

                            that._model
                                .save( that._model.values, options )
                                .then( callback.bind( null, null ) )
                                .catch( callback )

                        } else if ( that.Class.type.toLowerCase() === 'odm' ) {
                            
                            if ( !!that.Class.timeStampable ) {
                                that._model[ that.Class.updatedAt ] = Date.now();
                            }

                            that._model
                                .save( callback );

                        } else {
                            callback( 'Unsupported Model Type' );
                        }
                    },

                    function updateObject( _model, callback ) {
                        that._setModel( _model );
                        callback( null );
                    }
                ],
                function( err ) {
                    if ( err === null ) {
                        resolve( that );
                    } else {
                        reject( err );
                    }
                }
            );
        });
    },

    destroy: function( options ) {
        var that = this;

        this.debug( 'destroy(' + JSON.stringify( this ) + ')' );

        return new Promise( function( resolve, reject ) {
            if ( that.Class.type.toLowerCase() === 'orm' ) {

                that._model
                    .destroy( options )
                    .then( function() {
                        delete that._model;
                        resolve( {} );
                    })
                    .catch( reject )

            } else if ( that.Class.type.toLowerCase() === 'odm' ) {

                if ( !!that.Class.softDeleteable ) {
                    // Perform softDelete
                    that._model[ that.Class.deletedAt ] = Date.now();
                    that._model
                        .save( function( err ) {
                            if ( !err ) {
                                delete that._model;
                                resolve( {} );
                            } else {
                                reject( err );
                            }
                        });

                } else {
                    that._model.remove(function( err ) {
                        if ( !err ) {
                            delete that._model;
                            resolve( {} );
                        } else {
                            reject( err );
                        }
                    });
                }

            } else {
                reject( 'Unsupported Model Type' );
            }
        });
    },

    toJSON: function() {
        var that = this
          , json;

        if ( this.Class.type === 'ORM' ) {
            json = this._model.values;
        } else {
            json = this._model.toObject();

            // Add in the id if we have it defined
            if ( !!json._id ) {
                json.id = json._id;
                delete json._id;
            }
        }

        // Add in getters
        Object.keys( this.Class._getters ).forEach( function( getterName ) {
            if ( json[ getterName ] === undefined ) {
                json[ getterName ] = that[ getterName ];
            }
        });

        return json;
    }
});

Model.Types.ENUM.toString = function() {
    return 'ENUM';
};

Model.Types.BIGINT.toString = function() {
    return 'BIGINT';
};

Model.Types.FLOAT.toString = function() {
    return 'FLOAT';
};

Model.Types.DECIMAL.toString = function() {
    return 'DECIMAL';
};

Model.Types.TEXT.toString = function() {
    return 'TEXT';
};

module.exports = Model;