import React from 'react';
import { createRoot } from 'react-dom/client';
import ReactGA from 'react-ga';
import './index.css';
import App from './App';
import MapSelector from './MapSelector';
import { Router, Route, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

ReactGA.initialize('UA-189112106-1');
ReactGA.pageview(window.location.pathname + window.location.search);

const container = document.getElementById('root')
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/app/:map">
          {() => <App />}
        </Route>
        <Route path="/">
          <MapSelector />
        </Route>
      </Switch>
    </Router>
  </React.StrictMode>
);
