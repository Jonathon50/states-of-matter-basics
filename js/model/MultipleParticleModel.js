// Copyright 2002-2013, University of Colorado Boulder

/**
 * MultipleParticleModel. Ported directly from Java version.
 *
 * @author Aaron Davis
 */
define( function( require ) {
  'use strict';

  // modules
  var inherit = require( 'PHET_CORE/inherit' );
  var PropertySet = require( 'AXON/PropertySet' );
  var ObservableArray = require( 'AXON/ObservableArray' );
  var Rectangle = require( 'DOT/Rectangle' );
  var StatesOfMatterConstants = require( 'STATES_OF_MATTER_BASICS/StatesOfMatterConstants' );
  var NeonAtom = require( 'STATES_OF_MATTER_BASICS/model/particle/NeonAtom' );
  var MoleculeForceAndMotionDataSet = require( 'STATES_OF_MATTER_BASICS/model/MoleculeForceAndMotionDataSet' );
  var AbstractPhaseStateChanger = require( 'STATES_OF_MATTER_BASICS/model/AbstractPhaseStateChanger' );
  var MonatomicVerletAlgorithm = require( 'STATES_OF_MATTER_BASICS/model/MonatomicVerletAlgorithm' );
  var MonatomicPhaseStateChanger = require( 'STATES_OF_MATTER_BASICS/model/MonatomicPhaseStateChanger' );
  var MonatomicAtomPositionUpdater = require( 'STATES_OF_MATTER_BASICS/model/MonatomicAtomPositionUpdater' );
  var IsokineticThermostat = require( 'STATES_OF_MATTER_BASICS/model/engine/kinetic/IsokineticThermostat' );
  var AndersenThermostat = require( 'STATES_OF_MATTER_BASICS/model/engine/kinetic/AndersenThermostat' );

  // statics
  // The internal model temperature values for the various states.
  var SOLID_TEMPERATURE = 0.15;
  var SLUSH_TEMPERATURE = 0.33;
  var LIQUID_TEMPERATURE = 0.34;
  var GAS_TEMPERATURE = 1.0;

  // Constants that control various aspects of the model behavior.
  var DEFAULT_MOLECULE = StatesOfMatterConstants.NEON;
  var INITIAL_TEMPERATURE = SOLID_TEMPERATURE;
  var MAX_TEMPERATURE = 50.0;
  var MIN_TEMPERATURE = 0.0001;
  var INITIAL_GRAVITATIONAL_ACCEL = 0.045;
  var MAX_GRAVITATIONAL_ACCEL = 0.4;
  var MAX_TEMPERATURE_CHANGE_PER_ADJUSTMENT = 0.025;
  var TICKS_PER_TEMP_ADJUSTMENT = 10;
  var MIN_INJECTED_MOLECULE_VELOCITY = 0.5;
  var MAX_INJECTED_MOLECULE_VELOCITY = 2.0;
  var MAX_INJECTED_MOLECULE_ANGLE = Math.PI * 0.8;
  var VERLET_CALCULATIONS_PER_CLOCK_TICK = 8;

  // Constants used for setting the phase directly.
  var PHASE_SOLID = 1;
  var PHASE_LIQUID = 2;
  var PHASE_GAS = 3;
  var INJECTION_POINT_HORIZ_PROPORTION = 0.95;
  var INJECTION_POINT_VERT_PROPORTION = 0.5;

  // Possible thermostat settings.
  var NO_THERMOSTAT = 0;
  var ISOKINETIC_THERMOSTAT = 1;
  var ANDERSEN_THERMOSTAT = 2;
  var ADAPTIVE_THERMOSTAT = 3;

  // Parameters to control rates of change of the container size.
  var MAX_PER_TICK_CONTAINER_SHRINKAGE = 50;
  var MAX_PER_TICK_CONTAINER_EXPANSION = 200;

  // Countdown value used when recalculating temperature when the
  // container size is changing.
  var CONTAINER_SIZE_CHANGE_RESET_COUNT = 25;

  // Range for deciding if the temperature is near the current set point.
  // The units are internal model units.
  var TEMPERATURE_CLOSENESS_RANGE = 0.15;

  // Constant for deciding if a particle should be considered near to the
  // edges of the container.
  var PARTICLE_EDGE_PROXIMITY_RANGE = 2.5;

  // Values used for converting from model temperature to the temperature
  // for a given particle.
  var TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE = 0.26;    // Empirically determined.
  var CRITICAL_POINT_MONATOMIC_MODEL_TEMPERATURE = 0.8;  // Empirically determined.
  var NEON_TRIPLE_POINT_IN_KELVIN = 23;   // Tweaked a little from actual value for better temperature mapping.
  var NEON_CRITICAL_POINT_IN_KELVIN = 44;
  var ARGON_TRIPLE_POINT_IN_KELVIN = 75;  // Tweaked a little from actual value for better temperature mapping.
  var ARGON_CRITICAL_POINT_IN_KELVIN = 151;
  var O2_TRIPLE_POINT_IN_KELVIN = 54;
  var O2_CRITICAL_POINT_IN_KELVIN = 155;
  var WATER_TRIPLE_POINT_IN_KELVIN = 273;
  var WATER_CRITICAL_POINT_IN_KELVIN = 647;

  // The following values are used for temperature conversion for the
  // adjustable molecule.  These are somewhat arbitrary, since in the real
  // world the values would change if epsilon were changed.  They have been
  // chosen to be similar to argon, because the default epsilon value is
  // half of the allowable range, and this value ends up being similar to
  // argon.
  var ADJUSTABLE_ATOM_TRIPLE_POINT_IN_KELVIN = 75;
  var ADJUSTABLE_ATOM_CRITICAL_POINT_IN_KELVIN = 140;

  // Min a max values for adjustable epsilon.  Originally there was a wider
  // allowable range, but the simulation did not work so well, so the range
  // below was arrived at empirically and seems to work reasonably well.
  // var MIN_ADJUSTABLE_EPSILON = 1.5 * NeonAtom.EPSILON;
  // var MAX_ADJUSTABLE_EPSILON = StatesOfMatterConstants.EPSILON_FOR_WATER;


  var initializeModelParameters = function( context ) {
    // Initialize the system parameters.
    context = ( !context ) ? this : context;

    context.gravitationalAcceleration = INITIAL_GRAVITATIONAL_ACCEL;
    context.heatingCoolingAmount = 0;
    context.tempAdjustTickCounter = 0;
    context.temperatureSetPoint = INITIAL_TEMPERATURE;
    context.isExploded = false;
  };

  var setMoleculeType = function( context, moleculeID ) {
    context = ( !context ) ? this : context;

    // Verify that this is a supported value.
    if ( ( moleculeID !== StatesOfMatterConstants.DIATOMIC_OXYGEN ) &&
         ( moleculeID !== StatesOfMatterConstants.NEON ) &&
         ( moleculeID !== StatesOfMatterConstants.ARGON ) &&
         ( moleculeID !== StatesOfMatterConstants.WATER ) &&
         ( moleculeID !== StatesOfMatterConstants.USER_DEFINED_MOLECULE ) ) {

      throw new Error( "ERROR: Unsupported molecule type." );
      moleculeID = StatesOfMatterConstants.NEON;
    }

    // Retain the current phase so that we can set the particles back to
    // this phase once they have been created and initialized.
    var phase = context.mapTemperatureToPhase();

    // Remove existing particles and reset the global model parameters.
    context.removeAllParticles();
    context.initializeModelParameters();

    // Set the new molecule type.
    context.currentMolecule = moleculeID;

    // Set the model parameters that are dependent upon the molecule type.
    switch( context.currentMolecule ) {
      case StatesOfMatterConstants.DIATOMIC_OXYGEN:
        context.particleDiameter = OxygenAtom.RADIUS * 2;
        context.minModelTemperature = 0.5 * TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE / O2_TRIPLE_POINT_IN_KELVIN;
        break;
      case StatesOfMatterConstants.NEON:
        context.particleDiameter = NeonAtom.RADIUS * 2;
        context.minModelTemperature = 0.5 * TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE / NEON_TRIPLE_POINT_IN_KELVIN;
        break;
      case StatesOfMatterConstants.ARGON:
        context.particleDiameter = ArgonAtom.RADIUS * 2;
        context.minModelTemperature = 0.5 * TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE / ARGON_TRIPLE_POINT_IN_KELVIN;
        break;
      case StatesOfMatterConstants.WATER:
        // Use a radius value that is artificially large, because the
        // educators have requested that water look "spaced out" so that
        // users can see the crystal structure better, and so that the
        // solid form will look larger (since water expands when frozen).
        context.particleDiameter = OxygenAtom.RADIUS * 2.9;
        context.minModelTemperature = 0.5 * TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE / WATER_TRIPLE_POINT_IN_KELVIN;
        break;
      case StatesOfMatterConstants.USER_DEFINED_MOLECULE:
        context.particleDiameter = ConfigurableStatesOfMatterAtom.DEFAULT_RADIUS * 2;
        context.minModelTemperature = 0.5 * TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE / ADJUSTABLE_ATOM_TRIPLE_POINT_IN_KELVIN;
        break;
      default:
        debugger; // Should never happen, so it should be debugged if it does.
    }

    // Reset the container size. This must be done after the diameter is
    // initialized because the normalized size is dependent upon the
    // particle diameter.
    context.resetContainerSize();

    // Initiate a reset in order to get the particles into predetermined
    // locations and energy levels.
    context.initializeParticles( phase );
  };

  /**
   * @constructor
   */
  function MultipleParticleModel() {

    //----------------------------------------
    // All attributes ported from java version
    // ---------------------------------------

    // Strategy patterns that are applied to the data set in order to create
    // the overall behavior of the simulation.
    this.atomPositionUpdater = null;
    this.moleculeForceAndMotionCalculator = null;
    this.phaseStateChanger = null;
    this.isoKineticThermostat = null;
    this.andersenThermostat = null;

    // Attributes of the container and simulation as a whole.
    this.minAllowableContainerHeight = null;
    this.particles = new ObservableArray();
    this.isExploded = false;
    // final ConstantDtClock this.clock;

    // Data set containing the atom and molecule position, motion, and force information.
    this.moleculeDataSet = null; // will be initialized in initializeMonatomic

    this.particleDiameter = 1;
    this.normalizedContainerWidth = StatesOfMatterConstants.PARTICLE_CONTAINER_WIDTH / this.particleDiameter;
    this.gravitationalAcceleration = null;
    this.heatingCoolingAmount = null;
    this.tempAdjustTickCounter = null;
    this.currentMolecule = null;
    this.thermostatType = ADAPTIVE_THERMOSTAT;
    this.heightChangeCounter = DEFAULT_MOLECULE;
    this.minModelTemperature = null;

    // everything that had a listener in the java version becomes a property
    PropertySet.call( this, {
        particleContainerHeight: StatesOfMatterConstants.PARTICLE_CONTAINER_INITIAL_HEIGHT,
        targetContainerHeight: StatesOfMatterConstants.PARTICLE_CONTAINER_INITIAL_HEIGHT,
        numParticles: 0, // notifyParticleAdded
        temperatureSetPoint: 0, // notifyTemperatureChanged
        pressure: 0, // notifyPressureChanged
        moleculeType: 0, // notifyMoleculeTypeChanged,
        containerExplodedState: 0, // notifyContainerExplodedStateChanged
        interactionStrength: 0 // notifyInteractionStrengthChanged
      }
    );

    var thisModel = this;
    this.addDerivedProperty( 'normalizedContainerHeight', [ 'particleContainerHeight' ],
      function( height ) { return height / thisModel.particleDiameter; } );

    initializeModelParameters( this );
    setMoleculeType( this, DEFAULT_MOLECULE );

    // Do just enough initialization to allow the view and control
    // portions of the simulation to be properly created.  The rest of the
    // initialization will occur when the model is reset.
  }

  return inherit( PropertySet, MultipleParticleModel, {

    //----------------------------------------------------------------------------
    // Accessor Methods
    //----------------------------------------------------------------------------

    getNumMolecules: function() {
      return this.particles.length / this.moleculeDataSet.getAtomsPerMolecule();
    },

    /**
     * Get a rectangle that represents the current size and position of the particle container.
     */
    getParticleContainerRect: function() {
      return new Rectangle( 0, 0, StatesOfMatterConstants.PARTICLE_CONTAINER_WIDTH, this.particleContainerHeight );
    },

    /**
     * @param {Number} newTemperature
     */
    setTemperature: function( newTemperature ) {
      if ( newTemperature > MAX_TEMPERATURE ) {
        this.temperatureSetPoint = MAX_TEMPERATURE;
      }
      else if ( newTemperature < MIN_TEMPERATURE ) {
        this.temperatureSetPoint = MIN_TEMPERATURE;
      }
      else {
        this.temperatureSetPoint = newTemperature;
      }

      if ( this.isoKineticThermostat !== null ) {
        this.isoKineticThermostat.targetTemperature = newTemperature;
      }

      if ( this.andersenThermostat !== null ) {
        this.andersenThermostat.targetTemperature = newTemperature;
      }
    },

    /**
     * Get the current temperature in degrees Kelvin.
     */
    getTemperatureInKelvin: function() {
      return this.convertInternalTemperatureToKelvin();
    },

    setGravitationalAcceleration: function( acceleration ) {
      if ( acceleration > MAX_GRAVITATIONAL_ACCEL ) {
        throw new Error( "WARNING: Attempt to set out-of-range value for gravitational acceleration." );
        this.gravitationalAcceleration = MAX_GRAVITATIONAL_ACCEL;
      }
      else if ( acceleration < 0 ) {
        throw new Error( "WARNING: Attempt to set out-of-range value for gravitational acceleration." );
        this.gravitationalAcceleration = 0;
      }
      else {
        this.gravitationalAcceleration = acceleration;
      }
    },

    /**
     * Get the pressure value which is being calculated by the model and is
     * not adjusted to represent any "real" units (such as atmospheres).
     *
     * @return
     */
    getModelPressure: function() {
      return this.moleculeForceAndMotionCalculator.pressure;
    },

    /**
     * Set the molecule type to be simulated.
     *
     * @param {Number} moleculeID
     */
    setMoleculeType: function( moleculeID ) {
      setMoleculeType( this, moleculeID );
    },

    setThermostatType: function( type ) {
      if ( ( type === NO_THERMOSTAT ) ||
           ( type === ISOKINETIC_THERMOSTAT ) ||
           ( type === ANDERSEN_THERMOSTAT ) ||
           ( type === ADAPTIVE_THERMOSTAT ) ) {
        this.thermostatType = type;
      }
      else {
        throw new Error( "Thermostat type setting out of range: " + type );
      }
    },

    /**
     * Sets the target height of the container.  The target height is set
     * rather than the actual height because the model limits the rate at
     * which the height can changed.  The model will gradually move towards
     * the target height.
     *
     * @param {Number} desiredContainerHeight
     */
    setTargetParticleContainerHeight: function( desiredContainerHeight ) {
      desiredContainerHeight = Util.clamp( this.minAllowableContainerHeight,
                                           desiredContainerHeight,
                                           StatesOfMatterConstants.PARTICLE_CONTAINER_INITIAL_HEIGHT );
      this.targetContainerHeight = desiredContainerHeight;
    },

    /**
     * Get the sigma value, which is one of the two parameters that describes the Lennard-Jones potential.
     */
    getSigma: function() {
      var sigma;
      switch( this.currentMolecule ) {
        case StatesOfMatterConstants.NEON:
          sigma = NeonAtom.RADIUS * 2;
          break;
        case StatesOfMatterConstants.ARGON:
          sigma = ArgonAtom.RADIUS * 2;
          break;
        case StatesOfMatterConstants.DIATOMIC_OXYGEN:
          sigma = StatesOfMatterConstants.SIGMA_FOR_DIATOMIC_OXYGEN;
          break;
        case StatesOfMatterConstants.MONATOMIC_OXYGEN:
          sigma = OxygenAtom.RADIUS * 2;
          break;
        case StatesOfMatterConstants.WATER:
          sigma = StatesOfMatterConstants.SIGMA_FOR_WATER;
          break;
        case StatesOfMatterConstants.USER_DEFINED_MOLECULE:
          sigma = ConfigurableStatesOfMatterAtom.DEFAULT_RADIUS * 2;
          break;
        default:
          console.error( "Error: Unrecognized molecule type when setting sigma value." );
          sigma = 0;
      }

      return sigma;
    },

    /**
     * Get the epsilon value, which is one of the two parameters that describes the Lennard-Jones potential.
     */
    getEpsilon: function() {
        var epsilon;
        switch( this.currentMolecule ) {

            case StatesOfMatterConstants.NEON:
                epsilon = InteractionStrengthTable.getInteractionPotential( AtomType.NEON, AtomType.NEON );
                break;

            case StatesOfMatterConstants.ARGON:
                epsilon = InteractionStrengthTable.getInteractionPotential( AtomType.ARGON, AtomType.ARGON );
                break;

            case StatesOfMatterConstants.DIATOMIC_OXYGEN:
                epsilon = StatesOfMatterConstants.EPSILON_FOR_DIATOMIC_OXYGEN;
                break;

            case StatesOfMatterConstants.MONATOMIC_OXYGEN:
                epsilon = InteractionStrengthTable.getInteractionPotential( AtomType.OXYGEN, AtomType.OXYGEN );
                break;

            case StatesOfMatterConstants.WATER:
                epsilon = StatesOfMatterConstants.EPSILON_FOR_WATER;
                break;

            case StatesOfMatterConstants.USER_DEFINED_MOLECULE:
                epsilon = convertScaledEpsilonToEpsilon( this.moleculeForceAndMotionCalculator.getScaledEpsilon() );
                break;

            default:
                console.log( "Error: Unrecognized molecule type when getting epsilon value." );
                epsilon = 0;
        }

        return epsilon;
    },

    //----------------------------------------------------------------------------
    // Other Public Methods
    //----------------------------------------------------------------------------

    reset: function() {
      PropertySet.prototype.reset.call( this );
      this.initializeModelParameters();
      this.setMoleculeType( DEFAULT_MOLECULE );
    },

    /**
     * Set the phase of the particles in the simulation.
     * @param {Number} state
     */
    setPhase: function( state ) {
      switch( state ) {
        case PHASE_SOLID:
          this.phaseStateChanger.setPhase( AbstractPhaseStateChanger.PHASE_SOLID );
          break;

        case PHASE_LIQUID:
          this.phaseStateChanger.setPhase( AbstractPhaseStateChanger.PHASE_LIQUID );
          break;

        case PHASE_GAS:
          this.phaseStateChanger.setPhase( AbstractPhaseStateChanger.PHASE_GAS );
          break;

        default:
          console.error( "Error: Invalid state specified." );
          // Treat it as a solid.
          this.phaseStateChanger.setPhase( AbstractPhaseStateChanger.PHASE_SOLID );
          break;
      }

      this.syncParticlePositions();
    },

    /**
     * Sets the amount of heating or cooling that the system is undergoing.
     *
     * @param {Number} normalizedHeatingCoolingAmount Normalized amount of heating or cooling
     *                 that the system is undergoing, ranging from -1 to +1.
     */
    setHeatingCoolingAmount: function( normalizedHeatingCoolingAmount ) {
      assert && assert( normalizedHeatingCoolingAmount <= 1.0 ) && ( normalizedHeatingCoolingAmount >= -1.0 );
      this.heatingCoolingAmount = normalizedHeatingCoolingAmount * MAX_TEMPERATURE_CHANGE_PER_ADJUSTMENT;
    },

    /**
     * Inject a new molecule of the current type into the model.  This uses
     * the current temperature to assign an initial velocity.
     */
    injectMolecule: function() {},

    //----------------------------------------------------------------------------
    // Private Methods
    //----------------------------------------------------------------------------

    removeAllParticles: function() {
        this.particles.clear();

        // Get rid of the normalized particles.
        this.moleculeDataSet = null;
    },

    /**
     * Calculate the minimum allowable container height based on the current
     * number of particles.
     */
    calculateMinAllowableContainerHeight: function() {
      this.minAllowableContainerHeight = ( this.moleculeDataSet.numberOfMolecules / this.normalizedContainerWidth ) * this.particleDiameter;
    },

    /**
     * Initialize the particles by calling the appropriate initialization
     * routine, which will set their positions, velocities, etc.
     *
     * @param {Number} phase
     */
    initializeParticles: function( phase ) {

      // Initialize the particles.
      switch( this.currentMolecule ) {
        case StatesOfMatterConstants.DIATOMIC_OXYGEN:
          this.initializeDiatomic( this.currentMolecule, phase );
          break;
        case StatesOfMatterConstants.NEON:
          this.initializeMonatomic( this.currentMolecule, phase );
          break;
        case StatesOfMatterConstants.ARGON:
          this.initializeMonatomic( this.currentMolecule, phase );
          break;
        case StatesOfMatterConstants.USER_DEFINED_MOLECULE:
          this.initializeMonatomic( this.currentMolecule, phase );
          break;
        case StatesOfMatterConstants.WATER:
          this.initializeTriatomic( this.currentMolecule, phase );
          break;
        default:
          console.error( "ERROR: Unrecognized particle type, using default." );
          break;
      }

      this.calculateMinAllowableContainerHeight();
    },

    initializeModelParameters: function() {
      initializeModelParameters( this );
    },

    /**
     * Reset both the normalized and non-normalized sizes of the container.
     * Note that the particle diameter must be valid before this will work properly.
     */
    resetContainerSize: function() {
      // Set the initial size of the container.
      this.particleContainerHeight = StatesOfMatterConstants.PARTICLE_CONTAINER_INITIAL_HEIGHT;
      this.targetContainerHeight = StatesOfMatterConstants.PARTICLE_CONTAINER_INITIAL_HEIGHT;
      this.normalizedContainerWidth = StatesOfMatterConstants.PARTICLE_CONTAINER_WIDTH / this.particleDiameter;
    },

    /**
     * Step the model.  There is no time step used, as a fixed internal time step is assumed.
     * TODO: use dt instead of fixed timestep
     */
    step: function( dt ) {
      if ( !this.isExploded ) {
        // Adjust the particle container height if needed.
        if ( this.targetContainerHeight !== this.particleContainerHeight ) {
          this.heightChangeCounter = CONTAINER_SIZE_CHANGE_RESET_COUNT;
          var heightChange = this.targetContainerHeight - this.particleContainerHeight;
          if ( heightChange > 0 ) {
            // The container is growing.
            if ( this.particleContainerHeight + heightChange <= StatesOfMatterConstants.PARTICLE_CONTAINER_INITIAL_HEIGHT ) {
              this.particleContainerHeight += Math.min( heightChange, MAX_PER_TICK_CONTAINER_EXPANSION );
            }
            else {
              this.particleContainerHeight = StatesOfMatterConstants.PARTICLE_CONTAINER_INITIAL_HEIGHT;
            }
          }
          else {
            // The container is shrinking.
            if ( this.particleContainerHeight - heightChange >= this.minAllowableContainerHeight ) {
              this.particleContainerHeight += Math.max( heightChange, -MAX_PER_TICK_CONTAINER_SHRINKAGE );
            }
            else {
              this.particleContainerHeight = this.minAllowableContainerHeight;
            }
          }
          this.normalizedContainerHeight = this.particleContainerHeight / this.particleDiameter;
        }
        else {
          if ( this.heightChangeCounter > 0 ) {
            this.heightChangeCounter--;
          }
        }
      }
      else {
        // The lid is blowing off the container, so increase the container
        // size until the lid should be well off the screen.
        if ( this.particleContainerHeight < StatesOfMatterConstants.PARTICLE_CONTAINER_INITIAL_HEIGHT * 10 ) {
          this.particleContainerHeight += MAX_PER_TICK_CONTAINER_EXPANSION;
          notifyContainerSizeChanged();
        }
      }

      // Record the pressure to see if it changes.
      var pressureBeforeAlgorithm = this.getModelPressure();

      // Execute the Verlet algorithm.  The algorithm may be run several times
      // for each time step.
      for ( var i = 0; i < VERLET_CALCULATIONS_PER_CLOCK_TICK; i++ ) {
        this.moleculeForceAndMotionCalculator.updateForcesAndMotion();
        this.runThermostat();
      }

      // Sync up the positions of the normalized particles (the molecule data
      // set) with the particles being monitored by the view (the model data
      // set).
      this.syncParticlePositions();

      // If the pressure changed, notify the listeners.
      if ( this.getModelPressure() !== pressureBeforeAlgorithm ) {
        notifyPressureChanged();
      }

      // Adjust the temperature if needed.
      this.tempAdjustTickCounter++;
      if ( ( this.tempAdjustTickCounter > TICKS_PER_TEMP_ADJUSTMENT ) && this.heatingCoolingAmount !== 0 ) {
        this.tempAdjustTickCounter = 0;
        var newTemperature = this.temperatureSetPoint + this.heatingCoolingAmount;
        if ( newTemperature >= MAX_TEMPERATURE ) {
          newTemperature = MAX_TEMPERATURE;
        }
        else if ( ( newTemperature <= SOLID_TEMPERATURE * 0.9 ) && ( this.heatingCoolingAmount < 0 ) ) {
          // The temperature goes down more slowly as we begin to
          // approach absolute zero.
          newTemperature = this.temperatureSetPoint * 0.95;  // Multiplier determined empirically.
        }
        else if ( newTemperature <= this.minModelTemperature ) {
          newTemperature = this.minModelTemperature;
        }
        this.temperatureSetPoint = newTemperature;
        this.isoKineticThermostat.setTargetTemperature( this.temperatureSetPoint );
        this.andersenThermostat.setTargetTemperature( this.temperatureSetPoint );

        notifyTemperatureChanged();
      }
    },

    /**
     * Run the appropriate thermostat based on the settings and the state of
     * the simulation.
     */
    runThermostat: function() {

      if ( this.isExploded ) {
        // Don't bother to run any thermostat if the lid is blown off -
        // just let those little particles run free!
        return;
      }

      var calculatedTemperature = this.moleculeForceAndMotionCalculator.temperature;
      var temperatureIsChanging = false;

      if ( ( this.heatingCoolingAmount !== 0 ) ||
           ( this.temperatureSetPoint + TEMPERATURE_CLOSENESS_RANGE < calculatedTemperature ) ||
           ( this.temperatureSetPoint - TEMPERATURE_CLOSENESS_RANGE > calculatedTemperature ) ) {
        temperatureIsChanging = true;
      }

      if ( this.heightChangeCounter !== 0 && particlesNearTop() ) {
        // The height of the container is currently changing and there
        // are particles close enough to the top that they may be
        // interacting with it.  Since this can end up adding or removing
        // kinetic energy (i.e. heat) from the system, no thermostat is
        // run in this case.  Instead, the temperature determined by
        // looking at the kinetic energy of the molecules and that value
        // is used to set the system temperature set point.
        setTemperature( this.moleculeDataSet.calculateTemperatureFromKineticEnergy() );
      }
      else if ( ( this.thermostatType == ISOKINETIC_THERMOSTAT ) ||
                ( this.thermostatType == ADAPTIVE_THERMOSTAT && ( temperatureIsChanging || this.temperatureSetPoint > LIQUID_TEMPERATURE ) ) ) {
        // Use the isokinetic thermostat.
        this.isoKineticThermostat.adjustTemperature();
      }
      else if ( ( this.thermostatType == ANDERSEN_THERMOSTAT ) ||
                ( this.thermostatType == ADAPTIVE_THERMOSTAT && !temperatureIsChanging ) ) {
        // The temperature isn't changing and it is below a certain
        // threshold, so use the Andersen thermostat.  This is done for
        // purely visual reasons - it looks better than the isokinetic in
        // these circumstances.
        this.andersenThermostat.adjustTemperature();
      }

      // Note that there will be some circumstances in which no thermostat
      // is run.  This is intentional.
    },

    /**
     * Initialize the various model components to handle a simulation in which
     * all the molecules are single atoms.
     *
     * @param {Number} moleculeID
     * @param {Number} phase
     */
    initializeMonatomic: function( moleculeID, phase ) {

      // Verify that a valid molecule ID was provided.
      assert && assert( moleculeID === StatesOfMatterConstants.NEON || moleculeID === StatesOfMatterConstants.ARGON )

      // Determine the number of atoms/molecules to create.  This will be a cube
      // (really a square, since it's 2D, but you get the idea) that takes
      // up a fixed amount of the bottom of the container, so the number of
      // molecules that can fit depends on the size of the individual.
      var particleDiameter;
      if ( moleculeID == StatesOfMatterConstants.NEON ) {
        particleDiameter = NeonAtom.RADIUS * 2;
      }
      else if ( moleculeID == StatesOfMatterConstants.ARGON ) {
        particleDiameter = ArgonAtom.RADIUS * 2;
      }
      else {
        // Force it to neon.
        moleculeID = StatesOfMatterConstants.NEON;
        particleDiameter = NeonAtom.RADIUS * 2;
      }

      // Initialize the number of atoms assuming that the solid form, when
      // made into a square, will consume about 1/3 the width of the container.
      var numberOfAtoms = Math.pow( Math.round( StatesOfMatterConstants.CONTAINER_BOUNDS.width / ( ( particleDiameter * 1.05 ) * 3 ) ), 2 );

      // Create the normalized data set for the one-atom-per-molecule case.
      this.moleculeDataSet = new MoleculeForceAndMotionDataSet( 1 );

      // Create the strategies that will work on this data set.
      this.phaseStateChanger = new MonatomicPhaseStateChanger( this );
      this.atomPositionUpdater = new MonatomicAtomPositionUpdater();
      this.moleculeForceAndMotionCalculator = new MonatomicVerletAlgorithm( this );
      this.isoKineticThermostat = new IsokineticThermostat( this.moleculeDataSet, this.minModelTemperature );
      this.andersenThermostat = new AndersenThermostat( this.moleculeDataSet, this.minModelTemperature );

      // Create the individual atoms and add them to the data set.
      for ( var i = 0; i < numberOfAtoms; i++ ) {

        // Create the atom.
        var moleculeCenterOfMassPosition = new Vector2( 0, 0 );
        var moleculeVelocity = new Vector2( 0, 0 );
        var atomPositions = [];
        atomPositions.push( new Vector2( 0, 0 ) );

        // Add the atom to the data set.
        this.moleculeDataSet.addMolecule( atomPositions, moleculeCenterOfMassPosition, moleculeVelocity, 0 );

        // Add particle to model set.
        var atom;
        if ( moleculeID == StatesOfMatterConstants.NEON ) {
          atom = new NeonAtom( 0, 0 );
        }
        else if ( moleculeID == StatesOfMatterConstants.ARGON ) {
          atom = new ArgonAtom( 0, 0 );
        }
        else if ( moleculeID == StatesOfMatterConstants.USER_DEFINED_MOLECULE ) {
          atom = new ConfigurableStatesOfMatterAtom( 0, 0 );
        }
        else {
          atom = new NeonAtom( 0, 0 );
        }
        this.particles.push( atom );
      }

      // Initialize the particle positions according the to requested phase.
      this.setPhase( phase );
    },

    /**
     * Set the positions of the non-normalized particles based on the positions
     * of the normalized ones.
     */
    syncParticlePositions: function() {
      var positionMultiplier = this.particleDiameter;
      var atomPositions = this.moleculeDataSet.atomPositions;
      for ( var i = 0; i < this.moleculeDataSet.numberOfAtoms; i++ ) {
        this.particles[i].setPosition( atomPositions[i].x * positionMultiplier, atomPositions[i].y * positionMultiplier );
      }
      if ( this.moleculeDataSet.numberOfAtoms !== this.particles.length ) {
        console.log( "Inconsistent number of normalized versus non-normalized particles." );
      }
    },

    /**
     * Take the internal temperature value and convert it to Kelvin.  This
     * is dependent on the type of molecule selected.  The values and ranges
     * used in this method were derived from information provided by Paul
     * Beale.
     */
    convertInternalTemperatureToKelvin: function() {

      if ( this.particles.size() === 0 ) {
        // Temperature is reported as 0 if there are no particles.
        return 0;
      }

      var temperatureInKelvin;
      var triplePoint = 0;
      var criticalPoint = 0;

      switch( this.currentMolecule ) {

        case StatesOfMatterConstants.NEON:
          triplePoint = NEON_TRIPLE_POINT_IN_KELVIN;
          criticalPoint = NEON_CRITICAL_POINT_IN_KELVIN;
          break;

        case StatesOfMatterConstants.ARGON:
          triplePoint = ARGON_TRIPLE_POINT_IN_KELVIN;
          criticalPoint = ARGON_CRITICAL_POINT_IN_KELVIN;
          break;

        case StatesOfMatterConstants.USER_DEFINED_MOLECULE:
          triplePoint = ADJUSTABLE_ATOM_TRIPLE_POINT_IN_KELVIN;
          criticalPoint = ADJUSTABLE_ATOM_CRITICAL_POINT_IN_KELVIN;
          break;

        case StatesOfMatterConstants.WATER:
          triplePoint = WATER_TRIPLE_POINT_IN_KELVIN;
          criticalPoint = WATER_CRITICAL_POINT_IN_KELVIN;
          break;

        case StatesOfMatterConstants.DIATOMIC_OXYGEN:
          triplePoint = O2_TRIPLE_POINT_IN_KELVIN;
          criticalPoint = O2_CRITICAL_POINT_IN_KELVIN;
          break;

        default:
          break;
      }

      if ( this.temperatureSetPoint <= this.minModelTemperature ) {
        // We treat anything below the minimum temperature as absolute zero.
        temperatureInKelvin = 0;
      }
      else if ( this.temperatureSetPoint < TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE ) {
        temperatureInKelvin = this.temperatureSetPoint * triplePoint / TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE;

        if ( temperatureInKelvin < 0.5 ) {
          // Don't return zero - or anything that would round to it - as
          // a value until we actually reach the minimum internal temperature.
          temperatureInKelvin = 0.5;
        }
      }
      else if ( this.temperatureSetPoint < CRITICAL_POINT_MONATOMIC_MODEL_TEMPERATURE ) {
        var slope = ( criticalPoint - triplePoint ) / ( CRITICAL_POINT_MONATOMIC_MODEL_TEMPERATURE - TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE );
        var offset = triplePoint - ( slope * TRIPLE_POINT_MONATOMIC_MODEL_TEMPERATURE );
        temperatureInKelvin = this.temperatureSetPoint * slope + offset;
      }
      else {
        temperatureInKelvin = this.temperatureSetPoint * criticalPoint / CRITICAL_POINT_MONATOMIC_MODEL_TEMPERATURE;
      }
      return temperatureInKelvin;
    },

    /**
     * Take the internal pressure value and convert it to atmospheres.  This
     * is dependent on the type of molecule selected.  The values and ranges
     * used in this method were derived from information provided by Paul
     * Beale.
     */
    getPressureInAtmospheres: function() {

      var pressureInAtmospheres;

      switch( this.currentMolecule ) {

        case StatesOfMatterConstants.NEON:
          pressureInAtmospheres = 200 * getModelPressure();
          break;

        case StatesOfMatterConstants.ARGON:
          pressureInAtmospheres = 125 * getModelPressure();
          break;

        case StatesOfMatterConstants.WATER:
          pressureInAtmospheres = 200 * getModelPressure();
          break;

        case StatesOfMatterConstants.DIATOMIC_OXYGEN:
          pressureInAtmospheres = 125 * getModelPressure();
          break;

        default:
          pressureInAtmospheres = 0;
          break;
      }

      return pressureInAtmospheres;
    },

    /**
     * Determine whether there are particles close to the top of the
     * container.  This can be important for determining whether movement
     * of the top is causing temperature changes.
     *
     * @return - true if particles are close, false if not
     */
    particlesNearTop: function() {
      var moleculesPositions = this.moleculeDataSet.moleculeCenterOfMassPositions;
      var threshold = this.normalizedContainerHeight - PARTICLE_EDGE_PROXIMITY_RANGE;
      var particlesNearTop = false;

      for ( var i = 0; i < this.moleculeDataSet.numberOfMolecules; i++ ) {
        if ( moleculesPositions[i].y > threshold ) {
          particlesNearTop = true;
          break;
        }
      }

      return particlesNearTop;
    },

    /**
     * Return a phase value based on the current temperature.
     *
     * @return
     */
    mapTemperatureToPhase: function() {
      var phase;
      if ( this.temperatureSetPoint < SOLID_TEMPERATURE + ( ( LIQUID_TEMPERATURE - SOLID_TEMPERATURE ) / 2 ) ) {
        phase = PHASE_SOLID;
      }
      else if ( this.temperatureSetPoint < LIQUID_TEMPERATURE + ( ( GAS_TEMPERATURE - LIQUID_TEMPERATURE ) / 2 ) ) {
        phase = PHASE_LIQUID;
      }
      else {
        phase = PHASE_GAS;
      }

      return phase;
    },

    /**
     * Convert a value for epsilon that is in the real range of values into a
     * scaled value that is suitable for use with the motion and force
     * calculators.
     *
     * @param {Number} epsilon
     */
    convertEpsilonToScaledEpsilon: function( epsilon ) {
      // The following conversion of the target value for epsilon
      // to a scaled value for the motion calculator object was
      // determined empirically such that the resulting behavior
      // roughly matched that of the existing monatomic molecules.
      return epsilon / ( StatesOfMatterConstants.MAX_EPSILON / 2 );
    },

    convertScaledEpsilonToEpsilon: function( scaledEpsilon ) {
      var epsilon = scaledEpsilon * StatesOfMatterConstants.MAX_EPSILON / 2;
      return epsilon;
    }

  } );
} );
