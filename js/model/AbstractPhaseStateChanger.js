// Copyright 2002-2013, University of Colorado Boulder

/**
 * This is the base class for the objects that directly change the state of
 * the molecules within the multi-particle simulation.
 *
 * @author John Blanco
 * @author Aaron Davis
 */
define( function( require ) {
  'use strict';

  // modules
  var inherit = require( 'PHET_CORE/inherit' );
  var StatesOfMatterAtom = require( 'STATES_OF_MATTER_BASICS/model/particle/StatesOfMatterAtom' );
  var AtomType = require( 'STATES_OF_MATTER_BASICS/model/AtomType' );

  // constants
  var DISTANCE_BETWEEN_PARTICLES_IN_CRYSTAL = 0.12;  // In particle diameters.
  var MAX_PLACEMENT_ATTEMPTS = 500; // For random placement of particles.
  var MIN_INITIAL_PARTICLE_TO_WALL_DISTANCE = 2.5;

  /**
   * @constructor
   */
  function AbstractPhaseStateChanger( model ) {
    this.model = model;
  }

  return inherit( Object, AbstractPhaseStateChanger, {

    /**
     * Does a linear search for a location that is suitably far away enough
     * from all other molecules.  This is generally used when the attempt to
     * place a molecule at a random location fails.  This is expensive in
     * terms of computational power, and should thus be used sparingly.
     *
     * @return
     */
    findOpenMoleculeLocation: function() {

      var posX, posY;
      var minInitialInterParticleDistance;
      var moleculeDataSet = this.model.moleculeDataSet;
      var moleculeCenterOfMassPositions = moleculeDataSet.moleculeCenterOfMassPositions;

      if ( moleculeDataSet.getAtomsPerMolecule() === 1 ) {
        minInitialInterParticleDistance = 1.2;
      }
      else {
        minInitialInterParticleDistance = 1.5;
      }

      var rangeX = this.model.getNormalizedContainerWidth() - ( 2 * MIN_INITIAL_PARTICLE_TO_WALL_DISTANCE );
      var rangeY = this.model.getNormalizedContainerHeight() - ( 2 * MIN_INITIAL_PARTICLE_TO_WALL_DISTANCE );
      for ( var i = 0; i < rangeX / minInitialInterParticleDistance; i++ ) {
        for ( var j = 0; j < rangeY / minInitialInterParticleDistance; j++ ) {
          posX = MIN_INITIAL_PARTICLE_TO_WALL_DISTANCE + ( i * minInitialInterParticleDistance );
          posY = MIN_INITIAL_PARTICLE_TO_WALL_DISTANCE + ( j * minInitialInterParticleDistance );

          // See if this position is available.
          var positionAvailable = true;
          for ( var k = 0; k < moleculeDataSet.getNumberOfMolecules(); k++ ) {
            if ( moleculeCenterOfMassPositions[k].distance( posX, posY ) < minInitialInterParticleDistance ) {
              positionAvailable = false;
              break;
            }
          }
          if ( positionAvailable ) {
            // We found an open position.
            return new Vector2( posX, posY );
          }
        }
      }
      console.error( "Error: No open positions available for molecule." );
      return null;
    }

  } );
} );
