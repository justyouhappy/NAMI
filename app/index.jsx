import 'babel-polyfill'
import React from 'react'
import { browserHistory, hashHistory, Router, Route, IndexRoute } from 'react-router'
import {render} from 'react-dom'
import {Provider} from 'react-redux'
import store from './store/index.js'
import socket from './actions/socket'
import App from './components/App.jsx'
import Layout from './containers/Layout.js'
import Login from './pages/sign/Login.jsx'
import SignUp from './pages/sign/SignUp.jsx'
import Join from './pages/join/index.jsx'
import browser from './util/browers.js' 
import language from './config/language.js'
import notification from './util/notification.js'
import handleMessage from './util/message.js'
import { disconnect } from './actions/connect.js'
import { 
    getUserInfo, 
    mergeUserInfo 
} from './actions/user.js'
import { 
    getRoomList, 
    getPrivateList,
    addUnreadCount,
} from './actions/activeList.js'
import { 
    pushSnackbar, 
    setNotificationState 
} from './actions/pageUI.js'
import { 
    recevieMessage, 
    initActiveListMessages, 
    receviePrivate, 
    removeHistories 
} from './actions/messages.js'
import { 
    errPrint, 
    changeRoom 
} from './actions/combin.js'
import { 
    roomsSchema, 
    privateSchema, 
    getInitPrivateData 
} from './middlewares/schemas.js'
import { normalize } from 'normalizr'


import './less/media.less'
import './less/CSSTransition.less'
import './less/List.less'
import './less/Profile.less'

notification.requestPermission();

const device = browser.versions.mobile ? 'mobile' : 'PC';
function initLocalSetting(){
    let notifications = {};
    try{
        notifications = JSON.parse(localStorage.getItem('notifications'));
    }catch(err){
        console.warn(err);
    }
    setNotificationState(notifications);
}
const handleInit = (token) => {
    initLocalSetting();
    getUserInfo({token,device})
    .then((ret) => {
        ret.token = token;
        mergeUserInfo(ret);
        return getRoomList({token}); 
    })
    .then((ret)=>{
        const entity = normalize(ret,roomsSchema).entities;
        initActiveListMessages(entity);
        return getPrivateList({token});
    })
    .then((ret)=>{
        const entity = getInitPrivateData(ret);
        if(lastRoom && lastRoom.room){
            changeRoom(lastRoom.isPrivate)(lastRoom.room);
        }
        return initActiveListMessages(entity);
    })
    .catch((err) => {
        errPrint(err);
        browserHistory.push('/login');
    })
}
const handleEnter = (nextState,replace) => {
    const state = store.getState();
    const token = localStorage.getItem('token') || state.getIn(['user','token']);
    const userId = state.getIn(['user','_id']);
    if(token){
        if(!userId) return handleInit(token);
    } else{
        replace({pathname: '/login'});
    }
}

socket.on('newMessage',(message)=>{
    console.log('newMessage: ',message);
    addUnreadCount({_id: message.room});
    const state = store.getState();
    const desktopAlerts = state.getIn(['pageUI','notifications','desktopAlerts']),
        showDesktopPreviews = state.getIn(['pageUI','notifications','showDesktopPreviews']);
    if(document.hidden && desktopAlerts){
        notification.showNotification({
            title: message.owner.nickname,
            body:  showDesktopPreviews ? handleMessage.getMessagePreview(message) : '[hidden]',
            icon: message.owner.avatar,
        })
    }
    recevieMessage(message);

})
socket.on('privateMessage',(message)=>{
    console.log('recive private message: ',message);
    addUnreadCount({_id: message.room});
    receviePrivate(message);
})
socket.on('revokeMessage', (info) => {
    removeHistories([info._id]);
})

let lastOnlineTime, lastRoom, disconnectCount = 0;
socket.on('disconnect',()=>{
    console.log('disconnect');
    const state = store.getState();
    const room = state.getIn(['user','curRoom']);
    const isPrivate = state.getIn(['activeList',room,'isPrivate']);
    lastRoom = { room, isPrivate };
    lastOnlineTime = Date.now();
})
socket.on('reconnecting',()=>{
    disconnectCount ++;
    console.log('reconnect count: ',disconnectCount);
})
socket.on('reconnect',()=>{
    console.log('reconnect success');
    disconnectCount = 0;
    const token = localStorage.getItem('token');
    disconnect({token,lastOnlineTime})
    .then((ret) => handleInit(token))
    .catch(err => errPrint(err))
})
render(
    <Provider store ={store}>
    <div>
        <Router history = { browserHistory }>
            <Route path = '/' component = {App} >
                <IndexRoute component = {Layout} onEnter = {(nextState,replace)=>handleEnter(nextState,replace)}/>
                <Route path = '/invite' component = {Layout} onEnter = {(nextState,replace)=>handleEnter(nextState,replace)}>
                    <Route path = '/invite/:link' component = {Join}/>
                </Route>
                <Route path = '/login' component = {Login}/>
                <Route path = '/signup' component = {SignUp}/>
            </Route>
        </Router>
    </div>
    </Provider>
    ,
    document.getElementById('App')
)