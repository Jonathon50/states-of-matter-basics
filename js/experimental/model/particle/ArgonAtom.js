// Copyright 2002-2013, University of Colorado Boulder

/**
 * The class represents a single atom of argon in the model.
 *
 * @author John Blanco
 * @author Aaron Davis
 */
define( function( require ) {
  'use strict';

  // modules
  var inherit = require( 'PHET_CORE/inherit' );
  var StatesOfMatterAtom = require( 'STATES_OF_MATTER_BASICS/experimental/model/particle/StatesOfMatterAtom' );
  var AtomType = require( 'STATES_OF_MATTER_BASICS/experimental/model/AtomType' );

  // constants
  var RADIUS = 181;  // In picometers.
  var MASS = 39.948; // In atomic mass units.
  var ATOM_TYPE = AtomType.ARGON;

  /**
   * @param {Number} x
   * @param {Number} y
   * @constructor
   */
  function ArgonAtom( x, y ) {
    StatesOfMatterAtom.call( this, x, y, RADIUS, MASS );
  }

  return inherit( StatesOfMatterAtom, ArgonAtom, {

      getType: function() {
        return ATOM_TYPE;
      }

    },

    // public static final
    {
      RADIUS: RADIUS,
    } );
} );
