import language from '../config/language.js'
import stateManege from '../util/stateManage.js'
import config from '../config/config.js'
import socket from './socket.js'
import { browserHistory } from 'react-router'
import { pushSnackbar, setRightManager, setLeftManager, msgContainerScroll } from './pageUI.js'
import { roomsSchema , historySchema } from '../middlewares/schemas.js'
import { socketEmit, dispatchAction, dispatchThunk } from './common.js'
import { updateRoomInfo, mergeRoomInfo } from './activeList.js'
import { normalize } from 'normalizr'
import { 
    getSendFunc, 
    mergeMessage, 
    addMessage, 
    clearHistory, 
    addHistories, 
    initItem,
    removeItemMessage,
} from './messages.js'
import { 
    mergeUserInfo, 
    updateUserInfo, 
    createRoom, 
    pushExpression,
    addBlockContact,
    removeBlockContact,
    pushBlock,
    deleteBlock,
} from './user.js'

export const errPrint = (err) => {
    console.error(err); 
    language[err]? pushSnackbar(language[err]): pushSnackbar(language['ERROR1000']);
}

function mergeCbMessage(preMsg,ret){
    let message = {};
    message[preMsg._id] = {isLoading: false};
    message[preMsg._id].Tid = ret._id;
    message[preMsg._id].Ttimestamp = ret.timestamp;
    message[preMsg._id].Tcontent = ret.content;
    mergeMessage(message);
}
export const sendMessage = (isPrivate = false) => (msg,preMsg) => {
    addMessage(preMsg);
    getSendFunc(isPrivate)(msg)
    .then((ret) => mergeCbMessage(preMsg, ret))
    .catch(err => {
        errPrint(err);
        browserHistory.push('/login');
    })
}

export const sendFile = (isPrivate = false) => (msg,fileHandle) => {
    fileHandle.getUrlData()
    .then(ret=>{
        if(msg.preMessage.type === 'file'){
            msg.preMessage.content = JSON.stringify(fileHandle.getFileInfo());
        } else {
            msg.preMessage.content =  ret;
        }
        addMessage(msg.preMessage);
        return fileHandle.upload();
    })
    .then(ret => {
        if(msg.message.type === 'file'){
            msg.message.content = JSON.stringify({...fileHandle.getFileInfo(),src: ret.src});
        } else {
            msg.message.content = ret.src;
        }
        return getSendFunc(isPrivate)(msg.message);
    })
    .then((ret) => mergeCbMessage(msg.preMessage,ret))
    .catch((err) => errPrint(err))
}

export const loadRoomHistory = dispatchThunk( () => {
    return (dispatch,getState) => {
        const state = getState(),
              limit = config.ScreenMessageLenght;
        const curRoomInfo = stateManege.getCurRoomInfo(state),
              messages = state.get('messages'),
              userId =  state.getIn(['user','_id']);
        const first = curRoomInfo.get('histories').first(),
              _id = curRoomInfo.get('_id');
        const timestamp = messages.getIn([first,'Ttimestamp']) || messages.getIn([first,'timestamp']);
        if(curRoomInfo.get('isPrivate')){
            return socketEmit('loadPrivateHistories')({
                limit, timestamp,
                fromUserId: _id,
                toUserId: userId,
            })
            .then((ret) => {
                const normalizeHis = normalize(ret,historySchema);
                addHistories({
                    histories: normalizeHis.entities.histories, 
                    room: {_id , histories: normalizeHis.result} 
                });
            })
        } else{
            return socketEmit('loadRoomHistories')({limit, timestamp , _id})
            .then((ret)=>{
                let entity = normalize([ret],roomsSchema).entities;
                let { _id, histories } = entity.rooms[ret._id];
                addHistories({ histories: entity.histories, room: {_id, histories} });
            })
        }
        
    }
})

export const changeRoom = isPrivate => curRoom => {
    msgContainerScroll(true);
    setRightManager({isShow: false});
    clearHistory();
    mergeUserInfo({curRoom});
    dispatchThunk(() => (dispatch,getState) =>{
        const state = getState(),
              maxLength = config.ScreenMessageLenght;
        const curRoom = state.getIn(['user','curRoom']);
        const curRoomInfo = state.getIn(['activeList',curRoom]);
        if(!curRoom) return;
        if(!curRoomInfo) return initItem(isPrivate)(curRoom).then(()=>loadRoomHistory());
        const length = curRoomInfo.get('histories').size;
        if(length < maxLength) return loadRoomHistory();
    })()
}
export const changeUserInfo = info => {
    updateUserInfo(info)
    .then(ret => mergeUserInfo(info))
    .catch(err => errPrint(err))
}

export const changeRoomInfo = info => {
    updateRoomInfo(info)
    .then(ret => {
        mergeRoomInfo(info);
    })
    .catch(err => errPrint(err))
}

export const createGroup = (info) => {
    pushSnackbar(language.newGroup);
    createRoom(info)
    .then(ret => {
        pushSnackbar(language.success);
        setLeftManager({isShow: false});
        changeRoom(false)(ret._id);
    })
    .catch(err => errPrint(err));
}

export const exitRoom = (info) => {
    socketEmit('exitRoom')(info)
    .then(ret => {
        changeRoom(false)('');
        removeItemMessage(info);
    })
    .catch(err => errPrint(err))
}

export const joinRoom = (info) => {
    socketEmit('joinRoom')(info)
    .then(ret => { 
        if(ret.isOk) {
            browserHistory.push('/');
            pushSnackbar(language.joinRoomSuccess);
            changeRoom(false)(ret._id);

        }
    })
    .catch(err => pushSnackbar(language.inviteLinkDisabled))
}

export const addExpression = (info) => {
    socketEmit('addExpression')(info)
    .then(()=>{
        pushExpression(info.expression);
        pushSnackbar(language.addExpression);
    })
    .catch((err)=>errPrint(err));
};

export const addBlock = (info) => {
    addBlockContact(info)
    .then(()=>{
        pushBlock(info.blockId);
        pushSnackbar(language.blockContact);
    })
    .catch(()=>pushSnackbar('block contact error'))
}
export const removeBlock = (info) => {
    removeBlockContact(info)
    .then(()=>{
        deleteBlock(info.blockId);
        pushSnackbar(language.removeBlock);
    })
    .catch(()=>pushSnackbar('delete block contact error'))
}

export const logout = () => {
    browserHistory.push('/login');
    delete localStorage.token;
    socket.disconnect();
    socket.connect();
}
