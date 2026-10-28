import { ExtractRPCFromHandler } from "../backend/types/utility";
import * as globalBoardsDeletePOSTHandler from "../backend/router/global/boards/delete/POST";
import * as globalBoardsGETHandler from "../backend/router/global/boards/GET";
import * as globalBoardsOwnerPOSTHandler from "../backend/router/global/boards/owner/POST";
import * as globalBoardsSavePOSTHandler from "../backend/router/global/boards/save/POST";
import * as globalContextGETHandler from "../backend/router/global/context/GET";
import * as globalProjectsAdminPOSTHandler from "../backend/router/global/projects/admin/POST";

export type ApiRouter = {
    global: {
        boards: {
            delete: {
                POST: ExtractRPCFromHandler<globalBoardsDeletePOSTHandler.Handle>;
            };
            GET: ExtractRPCFromHandler<globalBoardsGETHandler.Handle>;
            owner: {
                POST: ExtractRPCFromHandler<globalBoardsOwnerPOSTHandler.Handle>;
            };
            save: {
                POST: ExtractRPCFromHandler<globalBoardsSavePOSTHandler.Handle>;
            };
        };
        context: {
            GET: ExtractRPCFromHandler<globalContextGETHandler.Handle>;
        };
        projects: {
            admin: {
                POST: ExtractRPCFromHandler<globalProjectsAdminPOSTHandler.Handle>;
            };
        };
    };
};
