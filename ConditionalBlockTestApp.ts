import {
    IAppAccessors,
    IConfigurationExtend,
    IEnvironmentRead,
    IHttp,
    ILogger,
    IModify,
    IModifyCreator,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo, RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import {ConditionalBlockFiltersEngine, IBlock, IUIKitInteractionHandler, IUIKitResponse, UIKitBlockInteractionContext} from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import {SlashCommandContext} from './node_modules/@rocket.chat/apps-engine/definition/slashcommands';

export class ConditionalBlockTestApp extends App implements IUIKitInteractionHandler {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    // tslint:disable-next-line: max-line-length
    public async executeBlockActionHandler(context: UIKitBlockInteractionContext, read: IRead, http: IHttp, persistence: IPersistence, modify: IModify): Promise<IUIKitResponse> {
        const interactionData = context.getInteractionData();

        const { messageId } = await getMessageBlockRelation(interactionData.blockId, read);

        const value = JSON.parse(interactionData.value || '{ c: 0 }');

        const appUser = await read.getUserReader().getAppUser(this.getID()) as IUser;

        const msgBuilder = await modify.getUpdater().message(messageId, appUser);

        msgBuilder.setEditor(appUser);

        modify.getUpdater().finish(msgBuilder.setBlocks(getBlocks(value.c, interactionData.blockId, modify.getCreator())));

        return context.getInteractionResponder().successResponse();
    }

    protected async extendConfiguration(configuration: IConfigurationExtend, environmentRead: IEnvironmentRead): Promise<void> {
        configuration.slashCommands.provideSlashCommand({
            command: 'conditionalBlockTest',
            i18nDescription: 'Tests conditional Blocks',
            i18nParamsExample: '',
            providesPreview: false,
            async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {
                const msgBuilder = modify.getCreator().startMessage();
                msgBuilder.setRoom(context.getRoom());

                const blockId = String(Date.now());

                const messageId = await modify.getCreator().finish(msgBuilder.setBlocks(getBlocks(0, blockId, modify.getCreator())));

                await persistMessageBlockRelation(messageId, blockId, persis);
            },
        });
    }
}

function getBlocks(counter: number, blockId: string, creator: IModifyCreator): Array<IBlock> {
    const blocks = creator.getBlockBuilder();
    const innerBlocks = creator.getBlockBuilder();

    blocks
        .addSectionBlock({
            text: blocks.newMarkdownTextObject('The following is a common block you can see everywhere'),
        })
        // .addImageBlock({
        //     imageUrl: 'https://http.cat/200',
        //     altText: 'Http Cat Code 200 Ok',
        // })
        .addSectionBlock({
            text: blocks.newPlainTextObject(`Button interacted with ${counter} times`),
        })
        .addSectionBlock({
            text: blocks.newMarkdownTextObject('*But the next one is only visible in the livechat widget! :scream: *'),
        })
        .addConditionalBlock(
            innerBlocks
                // .addImageBlock({
                //     imageUrl: 'https://i.redd.it/vm0mgfjfqoc51.jpg',
                //     altText: 'Suprised Pikachu',
                // })
                // .addSectionBlock({ text: blocks.newPlainTextObject('alo') })
                .addActionsBlock({
                    blockId,
                    elements: [
                        blocks.newButtonElement({
                            text: blocks.newPlainTextObject('Increment Counter'),
                            actionId: 'increment',
                            value: JSON.stringify({ c: counter + 1 }),
                        }),
                        blocks.newButtonElement({
                            text: blocks.newPlainTextObject('Decrement Counter'),
                            actionId: 'decrement',
                            value: JSON.stringify({ c: counter - 1 }),
                        }),
                    ],
                })
            .getBlocks(),
            { engine: [ConditionalBlockFiltersEngine.LIVECHAT] },
        );

    return blocks.getBlocks();
}

async function persistMessageBlockRelation(messageId: string, blockId: string, persistence: IPersistence): Promise<void> {
    const assoc = [
        new RocketChatAssociationRecord(RocketChatAssociationModel.MESSAGE, messageId),
        new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, blockId),
    ];

    await persistence.createWithAssociations({ messageId, blockId }, assoc);
}

async function getMessageBlockRelation(blockId: string, read: IRead): Promise<{ messageId: string, blockId: string }> {
    const assoc = [
        new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, blockId),
    ];

    const [record] = await read.getPersistenceReader().readByAssociations(assoc);

    return record as { messageId: string, blockId: string };
}
