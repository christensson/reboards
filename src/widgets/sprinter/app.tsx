import React, {memo} from 'react';
import {SprinterApp} from './SprinterApp';

const AppComponent: React.FunctionComponent = () => <SprinterApp/>;

export const App = memo(AppComponent);
