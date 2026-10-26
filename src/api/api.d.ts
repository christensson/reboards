import { ExtractRPCFromHandler } from "../backend/types/utility";
import * as globalBoardsDeletePOSTHandler from "../backend/router/global/boards/delete/POST";
import * as globalBoardsGETHandler from "../backend/router/global/boards/GET";
import * as globalBoardsSavePOSTHandler from "../backend/router/global/boards/save/POST";
import * as globalContextGETHandler from "../backend/router/global/context/GET";

export type ApiRouter = {
    global: {
        boards: {
            delete: {
                POST: ExtractRPCFromHandler<globalBoardsDeletePOSTHandler.Handle>;
            };
            GET: ExtractRPCFromHandler<globalBoardsGETHandler.Handle>;
            save: {
                POST: ExtractRPCFromHandler<globalBoardsSavePOSTHandler.Handle>;
            };
        };
        context: {
            GET: ExtractRPCFromHandler<globalContextGETHandler.Handle>;
        };
    };
};
