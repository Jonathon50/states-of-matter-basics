//  Copyright 2002-2014, University of Colorado Boulder

/**
 * The 'Solid Liquid Gas' screen. Conforms to the contract specified in joist/Screen.
 *
 * @author Aaron Davis
 */
define( function( require ) {
  'use strict';

  // modules
  var inherit = require( 'PHET_CORE/inherit' );
  var Screen = require( 'JOIST/Screen' );
  var SolidLiquidGasScreenView = require( 'STATES_OF_MATTER_BASICS/solid-liquid-gas/view/SolidLiquidGasScreenView' );
  var MultipleParticleModel = require( 'STATES_OF_MATTER_BASICS/model/MultipleParticleModel' );
  var Rectangle = require( 'SCENERY/nodes/Rectangle' );

  // strings
  var solidLiquidGasString = require( 'string!STATES_OF_MATTER_BASICS/solid-liquid-gas' );

  /**
   * @constructor
   */
  function SolidLiquidGasScreen() {
    Screen.call( this, solidLiquidGasString, new Rectangle( 0, 0, 50, 50 ),
      function() { return new MultipleParticleModel(); },
      function( model ) { return new SolidLiquidGasScreenView( model ); },
      { backgroundColor: 'black', navigationBarIcon: new Rectangle( 0, 0, 50, 50 ) }
    );
  }

  return inherit( Screen, SolidLiquidGasScreen );
} );