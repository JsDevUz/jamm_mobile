import "./src/lib/dom-exception-polyfill";
import { registerRootComponent } from "expo";

const { registerGlobals } = require("@livekit/react-native");
registerGlobals();

const App = require("./App").default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
