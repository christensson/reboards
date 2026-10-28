import React, {memo} from 'react';
import {ReBoardsApp} from './ReBoardsApp';

const AppComponent: React.FunctionComponent = () => <ReBoardsApp/>;

export const App = memo(AppComponent);
